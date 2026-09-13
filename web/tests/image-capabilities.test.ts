import { beforeEach, expect, it, vi } from "vitest";
import axios from "axios";
import type { ModelChannel } from "@/stores/use-config-store";
vi.mock("@/stores/use-config-store", () => ({ buildApiUrl: (base: string, path: string) => `${base}/v1${path}` }));
vi.mock("@/i18n", () => ({ default: { t: (key: string) => key } }));
import { validateVoteImageChannel } from "@/services/api/vote-image-channel";
import { resolveUpscaleSize } from "@/lib/canvas/canvas-image-data";

const channel = { baseUrl: "https://image.vote520.com", apiKey: "test-only" } as ModelChannel;
beforeEach(() => vi.restoreAllMocks());
it("accepts an image-only catalog that adds a second image model", async () => {
    vi.spyOn(axios, "get").mockResolvedValue({ data: { data: [{ id: "gpt-image-2" }, { id: "gpt-image-2.5" }] } });
    await expect(validateVoteImageChannel(channel)).resolves.toBeUndefined();
});
it.each([{ ids: ["gpt-6", "gpt-image-2"] }, { ids: ["gpt-image-2.5"] }, { ids: [] }])("does not silently configure unsupported catalog $ids", async ({ ids }) => {
    vi.spyOn(axios, "get").mockResolvedValue({ data: { data: ids.map((id) => ({ id })) } });
    await expect(validateVoteImageChannel(channel)).rejects.toThrow("groupNotImageOnly");
});
it("preserves the aspect ratio and caps long-edge export", () => {
    expect(resolveUpscaleSize(1536, 1024, 4096)).toEqual({ width: 4096, height: 2731 });
    expect(resolveUpscaleSize(1024, 1536, 99999)).toEqual({ width: 2731, height: 4096 });
});
