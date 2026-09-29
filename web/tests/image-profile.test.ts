import { beforeEach, afterEach, expect, it, vi } from "vitest";
vi.mock("@/i18n", () => ({ default: { t: (key: string) => key } }));
beforeEach(() => vi.resetModules());
afterEach(() => vi.unstubAllGlobals());
it("loads explicit group capabilities and rejects unknown groups instead of guessing from names", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ version: 1, api_origin: "https://image.vote520.com", groups: { "21": "fixed", "34": "standard" } }))));
    const { imageModeForGroup } = await import("@/services/api/vote-image-profile");
    expect(await imageModeForGroup(21)).toBe("fixed"); expect(await imageModeForGroup(34)).toBe("standard"); expect(await imageModeForGroup(99)).toBeUndefined();
    expect(fetch).toHaveBeenCalledTimes(1);
});
it("rejects a test-environment policy on the production image origin", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ version: 1, api_origin: "https://fixture.invalid", groups: { "21": "standard" } }))));
    const { imageModeForGroup } = await import("@/services/api/vote-image-profile");
    await expect(imageModeForGroup(21)).rejects.toThrow("不匹配");
});
it("distinguishes the same model through its selected channel", async () => {
    const { defaultConfig, createModelChannel } = await import("@/stores/use-config-store");
    const { imageParameterMode } = await import("@/services/api/vote-image-profile");
    const channels = [createModelChannel({ id: "native", baseUrl: "https://image.vote520.com", imageParameterMode: "standard", models: [{ name: "gpt-image-2", capability: "image" }] }), createModelChannel({ id: "fixed", baseUrl: "https://image.vote520.com", imageParameterMode: "fixed", models: [{ name: "gpt-image-2", capability: "image" }] })];
    expect(imageParameterMode({ ...defaultConfig, channels, model: "native::gpt-image-2" })).toBe("standard");
    expect(imageParameterMode({ ...defaultConfig, channels, model: "fixed::gpt-image-2" })).toBe("fixed");
});
