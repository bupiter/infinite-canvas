import axios from "axios";
import localforage from "localforage";

import { buildApiUrl, type AiConfig } from "@/stores/use-config-store";

export const VOTE_IMAGE_API_ORIGIN = "https://image.vote520.com";
export const VOTE_IMAGE_MODEL = "gpt-image-2";

const DEFAULT_POLL_INTERVAL_MS = 3000;
const MAX_POLL_DURATION_MS = 30 * 60 * 1000;
const taskStore = localforage.createInstance({ name: "infinite-canvas", storeName: "sub2api_image_tasks" });
const completedTaskSources = new Map<string, Set<string>>();
const completedSourceTasks = new Map<string, string>();

export type Sub2ApiImageTaskContext = {
    surface: "canvas" | "image-workbench";
    projectId?: string;
    targetNodeId?: string;
    imageId?: string;
};

export type StoredSub2ApiImageTask = {
    id: string;
    baseUrl: string;
    model: typeof VOTE_IMAGE_MODEL;
    operation?: "generation" | "edit";
    keyFingerprint: string;
    createdAt: number;
    context?: Sub2ApiImageTaskContext;
};

type AsyncImageTaskPayload = {
    id?: string;
    task_id?: string;
    status?: "processing" | "completed" | "failed";
    result?: Record<string, unknown>;
    image_url?: string;
    error?: { message?: string } | string;
    msg?: string;
};

type TaskRequestOptions = {
    signal?: AbortSignal;
    context?: Sub2ApiImageTaskContext;
};

export type VoteImageConnectionFailureReason = "authentication_failed" | "group_not_image_only" | "service_unavailable";

export type VoteImageConnectionResult = { ok: true } | { ok: false; reason: VoteImageConnectionFailureReason };

export function isVoteImageGateway(config: Pick<AiConfig, "baseUrl">) {
    try {
        return new URL(config.baseUrl).origin.toLowerCase() === VOTE_IMAGE_API_ORIGIN;
    } catch {
        return false;
    }
}

export async function validateVoteImageConnection(apiKey: string, signal?: AbortSignal): Promise<VoteImageConnectionResult> {
    try {
        const response = await axios.get<{ data?: Array<{ id?: string }> }>(buildApiUrl(VOTE_IMAGE_API_ORIGIN, "/models"), {
            headers: { Authorization: `Bearer ${apiKey}` },
            signal,
            timeout: 15_000,
        });
        const models = new Set((response.data.data || []).map((model) => model.id?.trim()).filter((id): id is string => Boolean(id)));
        const isImageOnlyGroup = models.size === 1 && models.has(VOTE_IMAGE_MODEL);
        return isImageOnlyGroup ? { ok: true } : { ok: false, reason: "group_not_image_only" };
    } catch (error) {
        if (axios.isAxiosError(error) && (error.response?.status === 401 || error.response?.status === 403)) {
            return { ok: false, reason: "authentication_failed" };
        }
        return { ok: false, reason: "service_unavailable" };
    }
}

export async function requestSub2ApiImageTask(config: AiConfig, path: "/images/generations/async" | "/images/edits/async", body: Record<string, unknown> | FormData, options?: TaskRequestOptions) {
    const response = await axios.post<AsyncImageTaskPayload>(buildApiUrl(VOTE_IMAGE_API_ORIGIN, path), body, {
        headers: {
            Authorization: `Bearer ${config.apiKey}`,
            ...(body instanceof FormData ? {} : { "Content-Type": "application/json" }),
        },
        signal: options?.signal,
        validateStatus: (status) => status === 202,
    });
    const taskId = response.data.task_id || response.data.id;
    if (!taskId) throw new Error("生图服务未返回任务 ID");
    const task: StoredSub2ApiImageTask = {
        id: taskId,
        baseUrl: VOTE_IMAGE_API_ORIGIN,
        model: VOTE_IMAGE_MODEL,
        operation: path === "/images/edits/async" ? "edit" : "generation",
        keyFingerprint: await fingerprintApiKey(config.apiKey),
        createdAt: Date.now(),
        context: options?.context,
    };
    await saveTask(task);
    return waitForSub2ApiImageTask(config, task, retryAfterMs(response.headers["retry-after"]), options?.signal);
}

export async function resumeSub2ApiImageTask(config: AiConfig, task: StoredSub2ApiImageTask, signal?: AbortSignal) {
    return waitForSub2ApiImageTask(config, task, 0, signal);
}

export async function listPendingSub2ApiImageTasks(config: AiConfig) {
    const fingerprint = await fingerprintApiKey(config.apiKey);
    const baseUrl = VOTE_IMAGE_API_ORIGIN;
    const tasks: StoredSub2ApiImageTask[] = [];
    try {
        await taskStore.iterate<StoredSub2ApiImageTask, void>((task) => {
            if (task.baseUrl === baseUrl && task.keyFingerprint === fingerprint) tasks.push(task);
        });
    } catch {
        return [];
    }
    return tasks.sort((a, b) => a.createdAt - b.createdAt);
}

export async function acknowledgeSub2ApiImageSource(source: string) {
    const taskId = completedSourceTasks.get(source);
    if (!taskId) return;
    completedSourceTasks.delete(source);
    const remaining = completedTaskSources.get(taskId);
    remaining?.delete(source);
    if (remaining?.size) return;
    completedTaskSources.delete(taskId);
    await removeTask(taskId);
}

async function waitForSub2ApiImageTask(config: AiConfig, task: StoredSub2ApiImageTask, pollIntervalMs: number, signal?: AbortSignal) {
    const deadline = task.createdAt + MAX_POLL_DURATION_MS;
    while (true) {
        if (pollIntervalMs) await delay(pollIntervalMs, signal);
        let response;
        try {
            response = await axios.get<AsyncImageTaskPayload>(buildApiUrl(VOTE_IMAGE_API_ORIGIN, `/images/tasks/${encodeURIComponent(task.id)}`), {
                headers: { Authorization: `Bearer ${config.apiKey}` },
                signal,
            });
        } catch (error) {
            if (axios.isCancel(error) || signal?.aborted) throw error;
            if (!axios.isAxiosError(error) || !error.response || error.response.status >= 500 || error.response.status === 429) {
                if (Date.now() >= deadline) throw new Error("生图任务查询超时");
                pollIntervalMs = DEFAULT_POLL_INTERVAL_MS;
                continue;
            }
            if (error.response.status === 404) await removeTask(task.id);
            throw error;
        }
        const payload = response.data;
        if (payload.status === "processing") {
            if (Date.now() >= deadline) {
                await removeTask(task.id);
                throw new Error("生图任务执行超时");
            }
            pollIntervalMs = retryAfterMs(response.headers["retry-after"]);
            continue;
        }
        if (payload.status === "failed") {
            await removeTask(task.id);
            throw new Error(taskError(payload));
        }
        if (payload.status !== "completed") throw new Error("生图服务返回了未知任务状态");
        if (payload.result) {
            rememberCompletedTaskSources(task.id, payload.result);
            return payload.result;
        }
        if (payload.image_url) {
            const result = { data: [{ url: payload.image_url }] };
            rememberCompletedTaskSources(task.id, result);
            return result;
        }
        throw new Error("生图任务已完成，但没有返回图片");
    }
}

function rememberCompletedTaskSources(taskId: string, result: Record<string, unknown>) {
    const data = Array.isArray(result.data) ? result.data : [];
    const sources = new Set(data.flatMap((item) => (item && typeof item === "object" && typeof item.url === "string" && item.url ? [item.url] : [])));
    if (!sources.size) return;
    completedTaskSources.set(taskId, sources);
    sources.forEach((source) => completedSourceTasks.set(source, taskId));
}

function retryAfterMs(value: unknown) {
    const seconds = Number(value);
    return Number.isFinite(seconds) && seconds > 0 ? Math.min(10, Math.max(1, seconds)) * 1000 : DEFAULT_POLL_INTERVAL_MS;
}

function taskError(payload: AsyncImageTaskPayload) {
    if (typeof payload.error === "string" && payload.error) return payload.error;
    const errorMessage = typeof payload.error === "object" ? payload.error?.message : "";
    return errorMessage || payload.msg || "生图任务失败";
}

async function fingerprintApiKey(apiKey: string) {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(apiKey));
    return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, "0")).join("");
}

async function saveTask(task: StoredSub2ApiImageTask) {
    try {
        await taskStore.setItem(task.id, task);
    } catch {
        // Persistence only enables reload recovery; the accepted task must keep running in this session.
    }
}

async function removeTask(taskId: string) {
    try {
        await taskStore.removeItem(taskId);
    } catch {
        // A stale local record is harmless and can be discarded after the server expires it.
    }
}

function delay(ms: number, signal?: AbortSignal) {
    return new Promise<void>((resolve, reject) => {
        if (signal?.aborted) {
            reject(new DOMException("Aborted", "AbortError"));
            return;
        }
        const timer = window.setTimeout(resolve, ms);
        signal?.addEventListener(
            "abort",
            () => {
                window.clearTimeout(timer);
                reject(new DOMException("Aborted", "AbortError"));
            },
            { once: true },
        );
    });
}
