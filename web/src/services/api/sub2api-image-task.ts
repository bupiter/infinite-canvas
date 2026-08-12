import axios from "axios";
import localforage from "localforage";

import { buildApiUrl, type AiConfig } from "@/stores/use-config-store";
import { IMAGE_API_ORIGIN } from "@/constant/runtime-config";

const CANONICAL_IMAGE_API_ORIGIN = "https://image.vote520.com";
const LOCAL_IMAGE_API_ORIGIN = "http://127.0.0.1:18082";
const configuredImageOrigin = IMAGE_API_ORIGIN.trim().replace(/\/$/, "");
const browserHost = typeof window === "undefined" ? "" : window.location.hostname;
export const VOTE_IMAGE_API_ORIGIN = configuredImageOrigin ||
    (browserHost === "localhost" || browserHost === "127.0.0.1" || browserHost === "[::1]" ? LOCAL_IMAGE_API_ORIGIN : CANONICAL_IMAGE_API_ORIGIN);
export const VOTE_IMAGE_MODEL = "gpt-image-2";

const DEFAULT_POLL_INTERVAL_MS = 3000;
const MAX_RETRY_INTERVAL_MS = 10000;
const MAX_POLL_DURATION_MS = 30 * 60 * 1000;
const SUBMIT_REQUEST_TIMEOUT_MS = 45000;
const POLL_REQUEST_TIMEOUT_MS = 20000;
const MAX_POLL_TRANSIENT_RETRIES = 30;

const taskStore = localforage.createInstance({ name: "infinite-canvas", storeName: "sub2api_image_tasks" });
const completedTaskSources = new Map<string, Set<string>>();
const completedSourceTasks = new Map<string, string>();
const apiKeyQueues = new Map<string, Promise<void>>();

export type Sub2ApiImageTaskContext = {
    surface: "canvas" | "image-workbench";
    projectId?: string;
    targetNodeId?: string;
    imageId?: string;
};

export type ImageTaskPhase = "submit" | "poll" | "upstream";

/** A user-facing error that preserves which part of an async image request failed. */
export class Sub2ApiImageTaskError extends Error {
    constructor(
        message: string,
        public readonly phase: ImageTaskPhase,
        public readonly reason: "network" | "timeout" | "http" | "upstream" = "http",
    ) {
        super(message);
        this.name = "Sub2ApiImageTaskError";
    }
}

export type StoredSub2ApiImageTask = {
    id: string;
    baseUrl: string;
    model: typeof VOTE_IMAGE_MODEL;
    operation?: "generation" | "edit";
    keyFingerprint: string;
    createdAt: number;
    context?: Sub2ApiImageTaskContext;
    /** SHA-256 of the request body and output options; raw prompt/image data is never persisted. */
    requestFingerprint?: string;
};

type AsyncImageTaskPayload = {
    id?: string;
    task_id?: string;
    status?: string;
    result?: Record<string, unknown>;
    image_url?: string;
    error?: { code?: string; message?: string } | string;
    code?: string;
    msg?: string;
    http_status?: number;
};

type TaskRequestOptions = {
    signal?: AbortSignal;
    context?: Sub2ApiImageTaskContext;
    outputSize?: string;
    /** Used only by an explicit user retry. Recovery paths must leave this false. */
    forceNewTask?: boolean;
};

export function isVoteImageGateway(config: Pick<AiConfig, "baseUrl" | "model">) {
    try {
        const model = config.model.trim().toLowerCase();
        return new URL(config.baseUrl).origin.toLowerCase() === VOTE_IMAGE_API_ORIGIN && (model === VOTE_IMAGE_MODEL || model.endsWith(`/${VOTE_IMAGE_MODEL}`));
    } catch {
        return false;
    }
}

export async function requestSub2ApiImageTask(config: AiConfig, path: "/images/generations/async" | "/images/edits/async", body: Record<string, unknown> | FormData, options?: TaskRequestOptions) {
    const queueKey = await fingerprintApiKey(config.apiKey);
    const requestFingerprint = await fingerprintImageRequest(path, body, options?.outputSize);
    const operation = path === "/images/edits/async" ? "edit" : "generation";
    return enqueueForApiKey(queueKey, async () => {
        const existingTask = options?.context && !options.forceNewTask
            ? await findReusableTask(queueKey, operation, options.context, requestFingerprint)
            : undefined;
        if (existingTask) {
            try {
                return await waitForSub2ApiImageTask(config, existingTask, 0, options?.signal);
            } catch (error) {
                // The server may already have accepted and billed this task. Never
                // create a replacement automatically after a failed resume; only
                // an explicit user retry should submit a new task.
                if (canReplaceStoredTask(error)) await removeTask(existingTask.id);
                throw error;
            }
        }
        return submitAndWaitForTask(config, path, body, queueKey, requestFingerprint, options);
    });
}

export async function resumeSub2ApiImageTask(config: AiConfig, task: StoredSub2ApiImageTask, signal?: AbortSignal) {
    return waitForSub2ApiImageTask(config, task, 0, signal);
}

export async function listPendingSub2ApiImageTasks(config: AiConfig) {
    const fingerprint = await fingerprintApiKey(config.apiKey);
    const tasks: StoredSub2ApiImageTask[] = [];
    try {
        await taskStore.iterate<StoredSub2ApiImageTask, void>((task) => {
            if (task.baseUrl === VOTE_IMAGE_API_ORIGIN && task.keyFingerprint === fingerprint && task.createdAt >= Date.now() - MAX_POLL_DURATION_MS) tasks.push(task);
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

async function enqueueForApiKey<T>(queueKey: string, operation: () => Promise<T>) {
    const previous = apiKeyQueues.get(queueKey) || Promise.resolve();
    let release!: () => void;
    const barrier = new Promise<void>((resolve) => {
        release = resolve;
    });
    const tail = previous.catch(() => undefined).then(() => barrier);
    apiKeyQueues.set(queueKey, tail);
    await previous.catch(() => undefined);
    try {
        return await operation();
    } finally {
        release();
        if (apiKeyQueues.get(queueKey) === tail) apiKeyQueues.delete(queueKey);
    }
}

async function submitAndWaitForTask(
    config: AiConfig,
    path: "/images/generations/async" | "/images/edits/async",
    body: Record<string, unknown> | FormData,
    keyFingerprint: string,
    requestFingerprint: string,
    options?: TaskRequestOptions,
) {
    const deadline = Date.now() + MAX_POLL_DURATION_MS;
    let transientRetries = 0;
    let response;
    while (true) {
        try {
            response = await axios.post<AsyncImageTaskPayload>(buildApiUrl(VOTE_IMAGE_API_ORIGIN, path), body, {
                headers: {
                    Authorization: `Bearer ${config.apiKey}`,
                    ...(body instanceof FormData ? {} : { "Content-Type": "application/json" }),
                    ...(options?.outputSize
                        ? {
                              "X-Sub2api-Image-Output-Size": options.outputSize,
                              "X-Sub2api-Image-Resize-Filter": "lanczos",
                          }
                        : {}),
                },
                signal: options?.signal,
                timeout: SUBMIT_REQUEST_TIMEOUT_MS,
                validateStatus: (status) => status === 202,
            });
            break;
        } catch (error) {
            if (axios.isCancel(error) || options?.signal?.aborted) throw error;
            if (!isActiveTaskConflict(error)) throw normalizeTaskError(error, "submit");
            if (Date.now() >= deadline) throw normalizeTaskError(error, "submit");
            transientRetries += 1;
            await delay(
                retryDelayMs(transientRetries, axios.isAxiosError(error) ? error.response?.headers["retry-after"] : undefined),
                options?.signal,
            );
        }
    }
    const taskId = response.data.task_id || response.data.id;
    if (!taskId) throw new Error("生图服务未返回任务 ID");
    const task: StoredSub2ApiImageTask = {
        id: taskId,
        baseUrl: VOTE_IMAGE_API_ORIGIN,
        model: VOTE_IMAGE_MODEL,
        operation: path === "/images/edits/async" ? "edit" : "generation",
        keyFingerprint,
        createdAt: Date.now(),
        context: options?.context,
        requestFingerprint,
    };
    await saveTask(task);
    return waitForSub2ApiImageTask(config, task, retryAfterMs(response.headers["retry-after"]), options?.signal);
}

async function waitForSub2ApiImageTask(config: AiConfig, task: StoredSub2ApiImageTask, pollIntervalMs: number, signal?: AbortSignal) {
    const deadline = task.createdAt + MAX_POLL_DURATION_MS;
    let transientRetries = 0;
    while (true) {
        if (Date.now() >= deadline) {
            throw new Error("生成任务执行超时，请稍后重试");
        }
        if (pollIntervalMs) await delay(pollIntervalMs, signal);
        if (Date.now() >= deadline) {
            throw new Error("生成任务执行超时，请稍后重试");
        }
        let response;
        try {
            response = await axios.get<AsyncImageTaskPayload>(buildApiUrl(VOTE_IMAGE_API_ORIGIN, `/images/tasks/${encodeURIComponent(task.id)}`), {
                headers: { Authorization: `Bearer ${config.apiKey}` },
                signal,
                timeout: POLL_REQUEST_TIMEOUT_MS,
            });
        } catch (error) {
            if (axios.isCancel(error) || signal?.aborted) throw error;
            const status = axios.isAxiosError(error) ? error.response?.status : undefined;
            if (status === 404) {
                await removeTask(task.id);
                throw normalizeTaskError(error, "poll");
            }
            if (!isRetryableTransportError(error) || transientRetries >= MAX_POLL_TRANSIENT_RETRIES || Date.now() >= deadline) throw normalizeTaskError(error, "poll");
            transientRetries += 1;
            pollIntervalMs = retryDelayMs(transientRetries, axios.isAxiosError(error) ? error.response?.headers["retry-after"] : undefined);
            continue;
        }
        transientRetries = 0;
        const payload = response.data;
        const status = payload.status?.trim().toLowerCase();
        if (isPendingTaskStatus(status)) {
            pollIntervalMs = retryAfterMs(response.headers["retry-after"]);
            continue;
        }
        if (status === "failed") {
            await removeTask(task.id);
            throw new Sub2ApiImageTaskError(taskError(payload), "upstream", "upstream");
        }
        if (status !== "completed") throw new Error(taskError(payload, "生成服务返回了未知任务状态"));
        if (payload.result) {
            rememberCompletedTaskSources(task.id, payload.result);
            return payload.result;
        }
        if (payload.image_url) {
            const result = { data: [{ url: payload.image_url }] };
            rememberCompletedTaskSources(task.id, result);
            return result;
        }
        throw new Error("生成任务已完成，但没有返回图片");
    }
}

class FailedSub2ApiImageTaskError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "FailedSub2ApiImageTaskError";
    }
}

async function findReusableTask(
    keyFingerprint: string,
    operation: NonNullable<StoredSub2ApiImageTask["operation"]>,
    context: Sub2ApiImageTaskContext,
    requestFingerprint: string,
) {
    let match: StoredSub2ApiImageTask | undefined;
    try {
        await taskStore.iterate<StoredSub2ApiImageTask, void>((task) => {
            if (
                task.baseUrl === VOTE_IMAGE_API_ORIGIN &&
                task.keyFingerprint === keyFingerprint &&
                (task.operation || "generation") === operation &&
                task.requestFingerprint === requestFingerprint &&
                sameTaskContext(task.context, context) &&
                (!match || task.createdAt > match.createdAt)
            ) {
                match = task;
            }
        });
    } catch {
        return undefined;
    }
    return match;
}

function sameTaskContext(left: Sub2ApiImageTaskContext | undefined, right: Sub2ApiImageTaskContext) {
    return (
        left?.surface === right.surface &&
        left.projectId === right.projectId &&
        left.targetNodeId === right.targetNodeId &&
        left.imageId === right.imageId
    );
}

function canReplaceStoredTask(error: unknown) {
    return error instanceof Sub2ApiImageTaskError && (error.phase === "upstream" || error.reason === "http") || (axios.isAxiosError(error) && error.response?.status === 404);
}

function isActiveTaskConflict(error: unknown) {
    if (!axios.isAxiosError<AsyncImageTaskPayload>(error) || error.response?.status !== 429) return false;
    return readTaskCode(error.response.data) === "IMAGE_TASK_ALREADY_ACTIVE";
}

function isPendingTaskStatus(status: string | undefined) {
    return status === "queued" || status === "pending" || status === "created" || status === "running" || status === "in_progress" || status === "processing";
}

function isRetryableTransportError(error: unknown) {
    if (!axios.isAxiosError(error)) return false;
    const status = error.response?.status;
    return !status || status === 408 || status === 425 || status === 429 || status === 500 || status === 502 || status === 503 || status === 504;
}

function readTaskCode(value: unknown): string {
    if (!value) return "";
    if (typeof value === "string") {
        try {
            return readTaskCode(JSON.parse(value));
        } catch {
            return "";
        }
    }
    if (typeof value !== "object") return "";
    const payload = value as { code?: unknown; error?: unknown };
    if (typeof payload.code === "string") return payload.code;
    return readTaskCode(payload.error);
}

function rememberCompletedTaskSources(taskId: string, result: Record<string, unknown>) {
    const data = Array.isArray(result.data) ? result.data : [];
    const sources = new Set(data.flatMap((item) => (item && typeof item === "object" && typeof item.url === "string" && item.url ? [item.url] : [])));
    if (!sources.size) return;
    completedTaskSources.set(taskId, sources);
    sources.forEach((source) => completedSourceTasks.set(source, taskId));
}

function retryAfterMs(value: unknown) {
    const hinted = parseRetryAfterMs(value);
    return hinted === undefined ? DEFAULT_POLL_INTERVAL_MS : Math.min(MAX_RETRY_INTERVAL_MS, Math.max(1000, hinted));
}

function retryDelayMs(attempt: number, value: unknown) {
    const hinted = parseRetryAfterMs(value);
    if (hinted !== undefined) return Math.min(MAX_RETRY_INTERVAL_MS, Math.max(1000, hinted));
    const base = Math.min(MAX_RETRY_INTERVAL_MS, DEFAULT_POLL_INTERVAL_MS * 2 ** Math.max(0, attempt - 1));
    return Math.min(MAX_RETRY_INTERVAL_MS, base + Math.floor(Math.random() * 250));
}

function parseRetryAfterMs(value: unknown) {
    if (typeof value === "number" && Number.isFinite(value) && value > 0) return value * 1000;
    if (typeof value !== "string") return undefined;
    const seconds = Number(value);
    if (Number.isFinite(seconds) && seconds > 0) return seconds * 1000;
    const timestamp = Date.parse(value);
    if (!Number.isNaN(timestamp)) return Math.max(0, timestamp - Date.now());
    return undefined;
}

function taskError(payload: AsyncImageTaskPayload, fallback = "生成任务失败") {
    if (typeof payload.error === "string" && payload.error) return payload.error;
    const errorMessage = typeof payload.error === "object" ? payload.error?.message : "";
    const message = errorMessage || payload.msg || fallback;
    const code = typeof payload.error === "object" ? payload.error?.code || payload.code : payload.code;
    if (code && !message.includes(code)) return `${message} (${code})`;
    if (payload.http_status && payload.http_status >= 400 && !message.includes(`HTTP ${payload.http_status}`)) return `${message} (HTTP ${payload.http_status})`;
    return message;
}

function normalizeTaskError(error: unknown, phase: "submit" | "poll") {
    if (error instanceof Sub2ApiImageTaskError || axios.isCancel(error)) return error;
    const status = axios.isAxiosError(error) ? error.response?.status : undefined;
    const code = axios.isAxiosError(error) ? error.code : undefined;
    const network = !status && (code === "ERR_NETWORK" || code === "ECONNABORTED" || code === "ETIMEDOUT" || (error instanceof TypeError && /fetch/i.test(error.message)));
    if (network) {
        const label = phase === "submit" ? "提交" : "查询";
        const timeout = code === "ECONNABORTED" || code === "ETIMEDOUT";
        return new Sub2ApiImageTaskError(
            timeout ? `生图任务${label}超时，请检查 image.vote520.com 网络或稍后重试` : `生图任务${label}网络失败，请检查 image.vote520.com、代理或跨域配置`,
            phase,
            timeout ? "timeout" : "network",
        );
    }
    return error;
}

async function fingerprintImageRequest(path: string, body: Record<string, unknown> | FormData, outputSize?: string) {
    const parts = [path, outputSize || ""];
    if (body instanceof FormData) {
        let index = 0;
        for (const [key, value] of body.entries()) {
            if (typeof value === "string") {
                parts.push(`${index}:${key}:text:${value}`);
            } else {
                const bytes = await value.arrayBuffer();
                const digest = await crypto.subtle.digest("SHA-256", bytes);
                const hash = Array.from(new Uint8Array(digest), (item) => item.toString(16).padStart(2, "0")).join("");
                parts.push(`${index}:${key}:blob:${value.name || ""}:${value.type}:${value.size}:${hash}`);
            }
            index += 1;
        }
    } else {
        parts.push(canonicalJson(body));
    }
    return digestText(parts.join("\u0000"));
}

function canonicalJson(value: unknown): string {
    if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
    if (value && typeof value === "object") {
        return `{${Object.keys(value as Record<string, unknown>).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson((value as Record<string, unknown>)[key])}`).join(",")}}`;
    }
    return JSON.stringify(value) ?? "null";
}

async function digestText(value: string) {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
    return Array.from(new Uint8Array(digest), (item) => item.toString(16).padStart(2, "0")).join("");
}

async function fingerprintApiKey(apiKey: string) {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(apiKey));
    return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, "0")).join("");
}

async function saveTask(task: StoredSub2ApiImageTask) {
    try {
        await taskStore.setItem(task.id, task);
    } catch {
        // Persistence is best effort; the accepted task still continues in this session.
    }
}

async function removeTask(taskId: string) {
    try {
        await taskStore.removeItem(taskId);
    } catch {
        // A stale local record is harmless and expires with the server task.
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
