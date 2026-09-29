import { beforeEach, expect, it, vi } from "vitest";
import type { AiConfig } from "@/stores/use-config-store";
const task = vi.hoisted(() => vi.fn());
vi.mock("@/i18n", () => ({ default: { t: (key: string) => key } }));
vi.mock("@/stores/use-config-store", () => ({ resolveModelRequestConfig: (c: AiConfig) => c, resolveModelScript: () => undefined, withLocalProxy: (s: string) => s, buildApiUrl: (base: string, path: string) => base + path }));
vi.mock("@/services/api/model-plugin", () => ({ normalizePluginImages: (v: unknown) => v, runModelPlugin: vi.fn() }));
vi.mock("@/services/image-storage", () => ({ imageToDataUrl: async (image: { dataUrl: string }) => image.dataUrl }));
vi.mock("@/lib/image-utils", () => ({ dataUrlToFile: async () => new File(["fixture"], "ref.png", { type: "image/png" }) }));
vi.mock("@/services/api/sub2api-image-task", () => ({ isVoteImageGateway: () => true, requestSub2ApiImageTask: task, listPendingSub2ApiImageTasks: vi.fn(), resumeSub2ApiImageTask: vi.fn(), VOTE_IMAGE_MODEL: "gpt-image-2" }));
import { requestGeneration, requestEdit } from "@/services/api/image";
const config = { model: "gpt-image-2", baseUrl: "https://image.vote520.com", apiKey: "fixture", quality: "high", size: "2048x2048", count: "1", background: "transparent", systemPrompt: "", imageParameterMode: "standard" } as AiConfig;
beforeEach(() => task.mockReset().mockResolvedValue({ task_id: "fixture-id", data: [{ url: "https://fixture.invalid/image.png" }] }));
it("forwards native quality, dimensions and alpha settings without prompt or size overrides", async () => {
    const result = await requestGeneration(config, "Only my prompt");
    expect(task.mock.calls[0]![2]).toMatchObject({ quality: "high", size: "2048x2048", background: "transparent", prompt: "Only my prompt", n: 1 });
    expect(result[0]!.taskId).toBe("fixture-id");
});
it("keeps automatic native settings automatic", async () => {
    await requestGeneration({ ...config, quality: "auto", size: "auto", background: "" }, "auto");
    const body = task.mock.calls[0]![2];
    expect(body).not.toHaveProperty("size"); expect(body).not.toHaveProperty("quality"); expect(body).not.toHaveProperty("background");
});
it("does not infer fixed mode from the model name or stale native options", async () => {
    await requestGeneration({ ...config, imageParameterMode: "fixed" }, "Exact fixed prompt");
    expect(task.mock.calls[0]![2]).toMatchObject({ model: "gpt-image-2", prompt: "Exact fixed prompt", size: "1024x1024", quality: "low" });
    expect(task.mock.calls[0]![2]).not.toHaveProperty("background");
});
it("keeps selected parameters in asynchronous multipart edits", async () => {
    await requestEdit(config, "Make it blue", [{ id: "ref", name: "ref.png", type: "image/png", dataUrl: "data:image/png;base64,AA==" }]);
    const body = task.mock.calls[0]![2] as FormData;
    expect(body.get("quality")).toBe("high"); expect(body.get("size")).toBe("2048x2048"); expect(body.get("background")).toBe("transparent"); expect(body.get("n")).toBe("1"); expect(body.getAll("image")).toHaveLength(1);
    expect(body.get("prompt")).not.toContain("Create a strictly");
});
it("refuses to guess a mode for an unconfigured Vote key", async () => {
    await expect(requestGeneration({ ...config, imageParameterMode: undefined }, "fixture")).rejects.toThrow("参数模式");
    expect(task).not.toHaveBeenCalled();
});
