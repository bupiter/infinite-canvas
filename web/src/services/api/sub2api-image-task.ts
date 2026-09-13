import axios from "axios";
import localforage from "localforage";

import { buildApiUrl, type AiConfig } from "@/stores/use-config-store";
import { useImageTaskProgress, type ImageTaskPhase } from "@/stores/use-image-task-progress";
import { taskDelay, withImageTaskSlot } from "./image-task-queue";

export const VOTE_IMAGE_API_ORIGIN = "https://image.vote520.com";
export const VOTE_IMAGE_MODEL = "gpt-image-2";
const POLL_INTERVAL_MS = 3000;
const MAX_WAIT_MS = 30 * 60 * 1000;
const taskStore = localforage.createInstance({ name: "infinite-canvas", storeName: "sub2api_image_tasks" });
const running = new Map<string, Promise<Record<string, unknown>>>();

export type Sub2ApiImageTaskContext = {
    surface: "canvas" | "image-workbench";
    projectId?: string;
    targetNodeId?: string;
    imageId?: string;
};
type TaskPath = "/images/generations/async" | "/images/edits/async";
type StoredRequest = { path: TaskPath; json?: Record<string, unknown>; form?: [string, string | Blob][] };
export type SavedTaskImage = { storageKey: string; width: number; height: number; bytes: number; mimeType: string };
export type StoredSub2ApiImageTask = {
    id: string;
    baseUrl: string;
    model: string;
    operation?: "generation" | "edit";
    keyFingerprint: string;
    createdAt: number;
    context?: Sub2ApiImageTaskContext;
    requestedSize?: string;
    // Previous records use id directly as the server task ID.
    state?: "queued" | "submitting" | "accepted" | "unknown";
    serverTaskId?: string;
    acceptedAt?: number;
    request?: StoredRequest;
    savedImage?: SavedTaskImage;
};
type AsyncImageTaskPayload = {
    id?: string; task_id?: string; status?: "queued" | "processing" | "completed" | "failed";
    result?: Record<string, unknown>; image_url?: string; http_status?: number;
};
type TaskRequestOptions = { signal?: AbortSignal; context?: Sub2ApiImageTaskContext; requestedSize?: string };

export function isVoteImageGateway(config: Pick<AiConfig, "baseUrl" | "model">) {
    try {
        const model = config.model.trim().toLowerCase();
        return new URL(config.baseUrl).origin === VOTE_IMAGE_API_ORIGIN && (model === VOTE_IMAGE_MODEL || model.endsWith(`/${VOTE_IMAGE_MODEL}`));
    } catch { return false; }
}

function progress(task: StoredSub2ApiImageTask, phase: ImageTaskPhase) {
    useImageTaskProgress.getState().update(task.context?.imageId || task.id, { taskId: task.id, phase, startedAt: task.createdAt });
}

export async function requestSub2ApiImageTask(config: AiConfig, path: TaskPath, body: Record<string, unknown> | FormData, options?: TaskRequestOptions) {
    const task: StoredSub2ApiImageTask = {
        id: `local_${crypto.randomUUID()}`, baseUrl: VOTE_IMAGE_API_ORIGIN, model: VOTE_IMAGE_MODEL,
        operation: path === "/images/edits/async" ? "edit" : "generation", keyFingerprint: await fingerprintApiKey(config.apiKey),
        createdAt: Date.now(), context: options?.context, requestedSize: options?.requestedSize, state: "queued",
        request: body instanceof FormData ? { path, form: Array.from(body.entries()) } : { path, json: body },
    };
    // Persist before submission. Credentials never enter this queue.
    await saveTask(task);
    progress(task, "queued");
    return resumeSub2ApiImageTask(config, task, options?.signal);
}

export async function resumeSub2ApiImageTask(config: AiConfig, task: StoredSub2ApiImageTask, signal?: AbortSignal): Promise<Record<string, unknown>> {
    if (await fingerprintApiKey(config.apiKey) !== task.keyFingerprint) throw new Error("请使用提交任务时的生图 Key 获取结果");
    const existing = running.get(task.id);
    if (existing) return existing;
    const work = async (): Promise<Record<string, unknown>> => {
        const latest = await taskStore.getItem<StoredSub2ApiImageTask>(task.id);
        if (!latest) throw new Error("任务已在其他页面保存，请重新打开生成记录");
        if (latest.savedImage) {
            const { resolveImageUrl } = await import("../image-storage");
            const url = await resolveImageUrl(latest.savedImage.storageKey);
            if (url) return { task_id: latest.id, data: [{ url }] };
        }
        if (latest.state === "submitting" || latest.state === "unknown") {
            progress(latest, "unknown");
            throw new Error("提交结果待确认。为避免重复计费，已停止自动重发；请核对用量后再决定是否重新生成。");
        }
        try {
            if (latest.state === "queued") {
                progress(latest, "queued");
                return await withImageTaskSlot(latest.keyFingerprint, () => submitAndWait(config, latest, signal), signal);
            }
            return await waitForSub2ApiImageTask(config, latest, signal);
        } catch (error) {
            const persisted = await taskStore.getItem<StoredSub2ApiImageTask>(latest.id);
            if (persisted) progress(latest, persisted.state === "submitting" || persisted.state === "unknown" ? "unknown" : "recoverable");
            throw error;
        }
    };
    // Re-read persisted state under a per-task lock, including after another tab finishes.
    const promise = Promise.resolve(navigator.locks ? navigator.locks.request(`vote-image-task:${task.id}`, { signal }, work) : work());
    running.set(task.id, promise);
    try { return await promise; }
    finally { running.delete(task.id); }
}

async function submitAndWait(config: AiConfig, task: StoredSub2ApiImageTask, signal?: AbortSignal): Promise<Record<string, unknown>> {
    const deadline = Date.now() + MAX_WAIT_MS;
    const request = task.request;
    if (!request) throw new Error("待提交任务数据不完整，请重新创建任务");
    for (;;) {
        signal?.throwIfAborted();
        const body = request.form ? new FormData() : request.json!;
        if (body instanceof FormData) request.form!.forEach(([name, value]) => body.append(name, value));
        task.state = "submitting";
        await saveTask(task);
        progress(task, "submitting");
        let response;
        try {
            response = await axios.post<AsyncImageTaskPayload>(buildApiUrl(VOTE_IMAGE_API_ORIGIN, request.path), body, {
                headers: { Authorization: `Bearer ${config.apiKey}`, ...(body instanceof FormData ? {} : { "Content-Type": "application/json" }) },
                signal, timeout: 90000, validateStatus: (status) => status === 202,
            });
        } catch (error) {
            // Only this explicit admission rejection guarantees no task was created.
            if (axios.isAxiosError(error) && error.response?.status === 429 && error.response.data?.error?.code === "IMAGE_TASK_ALREADY_ACTIVE") {
                task.state = "queued";
                await saveTask(task);
                progress(task, "queued");
                if (Date.now() >= deadline) throw new Error("等待生图名额超时，稍后可继续提交此排队任务");
                await taskDelay(retryAfterMs(error.response.headers["retry-after"]), signal);
                continue;
            }
            const status = axios.isAxiosError(error) ? error.response?.status : undefined;
            if (status && [400, 401, 403, 404, 413, 422].includes(status)) {
                await taskStore.removeItem(task.id);
                progress(task, "failed");
                throw new Error(status === 401 || status === 403 ? "生图权限或余额校验未通过，请检查渠道配置" : `生图请求未被接受（${status}），请检查参数`);
            }
            task.state = "unknown";
            await saveTask(task);
            progress(task, "unknown");
            throw new Error("未能确认提交结果，已停止自动重发。请核对用量后再决定是否重新生成。");
        }
        const serverTaskId = response.data.task_id || response.data.id;
        if (!serverTaskId) {
            task.state = "unknown";
            await saveTask(task);
            progress(task, "unknown");
            throw new Error("服务未返回任务编号，已停止自动重发，请核对用量");
        }
        task.serverTaskId = serverTaskId;
        task.state = "accepted";
        task.acceptedAt = Date.now();
        delete task.request;
        await saveTask(task);
        return waitForSub2ApiImageTask(config, task, signal);
    }
}

async function waitForSub2ApiImageTask(config: AiConfig, task: StoredSub2ApiImageTask, signal?: AbortSignal): Promise<Record<string, unknown>> {
    const deadline = Date.now() + MAX_WAIT_MS;
    for (;;) {
        signal?.throwIfAborted();
        progress(task, "processing");
        let response;
        try {
            response = await axios.get<AsyncImageTaskPayload>(buildApiUrl(VOTE_IMAGE_API_ORIGIN, `/images/tasks/${encodeURIComponent(task.serverTaskId || task.id)}`), {
                headers: { Authorization: `Bearer ${config.apiKey}` }, signal, timeout: 20000,
            });
        } catch (error) {
            if (signal?.aborted || axios.isCancel(error)) throw error;
            const status = axios.isAxiosError(error) ? error.response?.status : undefined;
            if (status === 404) throw new Error("任务已过期或当前 Key 无法读取，请检查本机生成记录");
            if (status === 401 || status === 403) throw new Error("暂时无法读取任务，请检查原渠道 Key 后继续获取结果");
            if (Date.now() >= deadline) throw new Error("暂时无法查询任务，稍后可继续获取结果，无需重新生成");
            progress(task, "recoverable");
            await taskDelay(POLL_INTERVAL_MS, signal);
            continue;
        }
        const payload = response.data;
        if (payload.status === "queued" || payload.status === "processing") {
            if (Date.now() >= deadline) throw new Error("任务仍未完成，稍后可继续获取结果");
            await taskDelay(retryAfterMs(response.headers["retry-after"]), signal);
            continue;
        }
        if (payload.status === "failed") {
            await taskStore.removeItem(task.id);
            progress(task, "failed");
            throw new Error(`生图任务未完成${payload.http_status ? `（${payload.http_status}）` : ""}，请检查渠道状态后再决定是否重新生成`);
        }
        if (payload.status !== "completed") throw new Error("暂时无法识别任务状态，请稍后继续获取结果");
        const result = payload.result || (payload.image_url ? { data: [{ url: payload.image_url }] } : null);
        if (!result) throw new Error("任务已完成，图片暂不可读，请稍后继续获取结果");
        progress(task, "downloading");
        return { ...result, task_id: task.id };
    }
}

export async function listPendingSub2ApiImageTasks(config: AiConfig) {
    const fingerprint = await fingerprintApiKey(config.apiKey);
    const tasks: StoredSub2ApiImageTask[] = [];
    await taskStore.iterate<StoredSub2ApiImageTask, void>((task) => {
        if (task.baseUrl === VOTE_IMAGE_API_ORIGIN && task.keyFingerprint === fingerprint) tasks.push(task);
    });
    return tasks.sort((a, b) => a.createdAt - b.createdAt);
}

export async function findPendingImageTask(context: Sub2ApiImageTaskContext) {
    let found: StoredSub2ApiImageTask | undefined;
    await taskStore.iterate<StoredSub2ApiImageTask, void>((task) => {
        if (task.context?.surface === context.surface && task.context.projectId === context.projectId && task.context.imageId === context.imageId) found = task;
    });
    return found;
}

export async function rememberSavedTaskImage(taskId: string, savedImage: SavedTaskImage) {
    const task = await taskStore.getItem<StoredSub2ApiImageTask>(taskId);
    if (!task) return;
    task.savedImage = savedImage;
    await saveTask(task);
    progress(task, "saving");
}

export async function acknowledgeSavedImageTasks(storageKeys: Set<string>) {
    const finished: StoredSub2ApiImageTask[] = [];
    await taskStore.iterate<StoredSub2ApiImageTask, void>((task) => {
        if (task.savedImage && storageKeys.has(task.savedImage.storageKey)) finished.push(task);
    });
    for (const task of finished) {
        await taskStore.removeItem(task.id);
        progress(task, "saved");
    }
}

function retryAfterMs(value: unknown) {
    const seconds = Number(value);
    return Number.isFinite(seconds) && seconds > 0 ? Math.min(60, Math.max(1, seconds)) * 1000 : POLL_INTERVAL_MS;
}
async function fingerprintApiKey(apiKey: string) {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(apiKey));
    return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, "0")).join("");
}
async function saveTask(task: StoredSub2ApiImageTask) {
    try { await taskStore.setItem(task.id, task); }
    catch { throw new Error("无法保存任务记录，请释放浏览器存储空间后继续；已受理的任务不会自动重新生成"); }
}
