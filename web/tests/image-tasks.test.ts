import { beforeEach, describe, expect, it, vi } from "vitest";
import { webcrypto } from "node:crypto";
import axios from "axios";
import type { AiConfig } from "@/stores/use-config-store";

const memory = vi.hoisted(() => ({ data: new Map<string, unknown>(), failWrite: false }));
vi.mock("localforage", () => ({ default: { createInstance: () => ({
    getItem: async (key: string) => memory.data.get(key) || null,
    setItem: async (key: string, value: unknown) => { if (memory.failWrite) throw new Error("quota"); memory.data.set(key, structuredClone(value)); return value; },
    removeItem: async (key: string) => { memory.data.delete(key); },
    iterate: async (callback: (value: unknown) => void) => { [...memory.data.values()].forEach(callback); },
}) } }));
vi.mock("@/stores/use-config-store", () => ({ buildApiUrl: (base: string, path: string) => `${base}/v1${path}` }));
vi.mock("@/services/image-storage", () => ({ resolveImageUrl: async (key: string) => `blob:local/${key}` }));

import { acknowledgeSavedImageTasks, listPendingSub2ApiImageTasks, rememberSavedTaskImage, requestSub2ApiImageTask, resumeSub2ApiImageTask } from "@/services/api/sub2api-image-task";
import { useImageTaskProgress } from "@/stores/use-image-task-progress";

const config = { apiKey: "test-only-not-a-real-credential", model: "gpt-image-2", baseUrl: "https://image.vote520.com" } as AiConfig;
const create = (imageId = "slot") => requestSub2ApiImageTask(config, "/images/generations/async", { model: "gpt-image-2", prompt: "test fixture" }, { context: { surface: "image-workbench", imageId } });
const completed = () => ({ data: { status: "completed", result: { data: [{ url: "https://fixture.invalid/image.png" }] } }, headers: {} });
const httpError = (status: number, code?: string) => Object.assign(new Error("fixture"), { isAxiosError: true, response: { status, data: { error: { code } }, headers: { "retry-after": "1" } } });

beforeEach(() => {
    memory.data.clear(); memory.failWrite = false;
    useImageTaskProgress.setState({ tasks: {} });
    vi.restoreAllMocks();
    vi.stubGlobal("crypto", webcrypto);
    Object.defineProperty(navigator, "locks", { value: undefined, configurable: true });
    vi.spyOn(axios, "post").mockImplementation(async () => ({ data: { task_id: `server-${crypto.randomUUID()}` }, headers: {} }));
    vi.spyOn(axios, "get").mockImplementation(async () => completed());
});

describe("durable asynchronous image flow", () => {
    it("persists before sending and never persists the credential", async () => {
        vi.mocked(axios.post).mockImplementationOnce(async () => {
            expect(memory.data.size).toBe(1);
            expect(JSON.stringify([...memory.data.values()])).not.toContain(config.apiKey);
            return { data: { task_id: "server-one" }, headers: {} };
        });
        const result = await create();
        expect(result.task_id).toMatch(/^local_/);
        const task = (await listPendingSub2ApiImageTasks(config))[0];
        expect(task.serverTaskId).toBe("server-one");
        expect(task.request).toBeUndefined();
    });

    it("does not call the upstream when queue persistence fails", async () => {
        memory.failWrite = true;
        await expect(create()).rejects.toThrow("无法保存任务记录");
        expect(axios.post).not.toHaveBeenCalled();
    });

    it("bounds ten jobs to four active tasks and drains every queued job", async () => {
        const release: Array<() => void> = [];
        let active = 0, peak = 0;
        vi.mocked(axios.get).mockImplementation(() => {
            active++; peak = Math.max(peak, active);
            return new Promise((resolve) => release.push(() => { active--; resolve(completed()); }));
        });
        const jobs = Array.from({ length: 10 }, (_, i) => create(`slot-${i}`));
        await vi.waitFor(() => expect(release.length).toBe(4));
        expect(axios.post).toHaveBeenCalledTimes(4);
        while (vi.mocked(axios.post).mock.calls.length < 10) {
            release.splice(0).forEach((done) => done());
            await new Promise((resolve) => setTimeout(resolve, 300));
        }
        release.splice(0).forEach((done) => done());
        await Promise.all(jobs);
        expect(peak).toBe(4);
        expect(axios.post).toHaveBeenCalledTimes(10);
    });

    it("only retries a confirmed admission rejection", async () => {
        vi.mocked(axios.post).mockRejectedValueOnce(httpError(429, "IMAGE_TASK_ALREADY_ACTIVE"));
        await create();
        expect(axios.post).toHaveBeenCalledTimes(2);
    });

    it.each([undefined, 429, 500, 502])("does not replay an ambiguous submission (%s)", async (status) => {
        vi.mocked(axios.post).mockRejectedValueOnce(status ? httpError(status) : new Error("network lost"));
        await expect(create()).rejects.toThrow("停止自动重发");
        const task = (await listPendingSub2ApiImageTasks(config))[0];
        await expect(resumeSub2ApiImageTask(config, task)).rejects.toThrow("重复计费");
        expect(axios.post).toHaveBeenCalledTimes(1);
        expect(useImageTaskProgress.getState().tasks.slot.phase).toBe("unknown");
    });

    it("recovers accepted tasks by GET without another generation", async () => {
        await create();
        const task = (await listPendingSub2ApiImageTasks(config))[0];
        vi.mocked(axios.get).mockRejectedValueOnce(httpError(403));
        await expect(resumeSub2ApiImageTask(config, task)).rejects.toThrow("原渠道 Key");
        expect(await listPendingSub2ApiImageTasks(config)).toHaveLength(1);
        await resumeSub2ApiImageTask(config, task);
        expect(axios.post).toHaveBeenCalledTimes(1);
    });

    it("keeps expired/unknown server tasks recoverable without automatically generating again", async () => {
        await create();
        const task = (await listPendingSub2ApiImageTasks(config))[0];
        vi.mocked(axios.get).mockRejectedValueOnce(httpError(404));
        await expect(resumeSub2ApiImageTask(config, task)).rejects.toThrow("过期");
        expect(await listPendingSub2ApiImageTasks(config)).toHaveLength(1);
        expect(axios.post).toHaveBeenCalledTimes(1);
    });

    it("confirms completion by task and persisted image identity, independent of image URLs", async () => {
        const result = await create();
        const task = (await listPendingSub2ApiImageTasks(config))[0];
        const saved = { storageKey: `image:task:${result.task_id}`, width: 1536, height: 1024, bytes: 100, mimeType: "image/png" };
        await rememberSavedTaskImage(task.id, saved);
        expect(await listPendingSub2ApiImageTasks(config)).toHaveLength(1);
        const calls = vi.mocked(axios.get).mock.calls.length;
        const recovered = await resumeSub2ApiImageTask(config, task);
        expect((recovered.data as Array<{ url: string }>)[0].url).toMatch(/^blob:local/);
        expect(axios.get).toHaveBeenCalledTimes(calls);
        await acknowledgeSavedImageTasks(new Set(["unrelated-image"]));
        expect(await listPendingSub2ApiImageTasks(config)).toHaveLength(1);
        await acknowledgeSavedImageTasks(new Set([saved.storageKey]));
        expect(await listPendingSub2ApiImageTasks(config)).toHaveLength(0);
    });

    it("rejects another key before querying a saved task", async () => {
        await create();
        const task = (await listPendingSub2ApiImageTasks(config))[0];
        const calls = vi.mocked(axios.get).mock.calls.length;
        await expect(resumeSub2ApiImageTask({ ...config, apiKey: "other-test-key" }, task)).rejects.toThrow("提交任务时");
        expect(axios.get).toHaveBeenCalledTimes(calls);
    });

    it("resumes a persisted, never-submitted queue entry exactly once", async () => {
        const fingerprint = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(config.apiKey))), (value) => value.toString(16).padStart(2, "0")).join("");
        const task = { id: "local-reload", baseUrl: config.baseUrl, model: config.model, keyFingerprint: fingerprint, createdAt: Date.now(), state: "queued" as const, request: { path: "/images/generations/async" as const, json: { model: config.model, prompt: "fixture" } }, context: { surface: "image-workbench" as const, imageId: "reload-slot" } };
        memory.data.set(task.id, task);
        await Promise.all([resumeSub2ApiImageTask(config, task), resumeSub2ApiImageTask(config, task)]);
        expect(axios.post).toHaveBeenCalledTimes(1);
    });

    it("keeps an uncertain marker if recording the accepted ID fails", async () => {
        vi.mocked(axios.post).mockImplementationOnce(async () => {
            memory.failWrite = true;
            return { data: { task_id: "accepted-but-not-persisted" }, headers: {} };
        });
        await expect(create()).rejects.toThrow("无法保存任务记录");
        memory.failWrite = false;
        const task = (await listPendingSub2ApiImageTasks(config))[0];
        await expect(resumeSub2ApiImageTask(config, task)).rejects.toThrow("停止自动重发");
        expect(axios.post).toHaveBeenCalledTimes(1);
    });
});
