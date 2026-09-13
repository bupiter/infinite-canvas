import "fake-indexeddb/auto";
import { Blob as NativeBlob } from "node:buffer";
import { beforeEach, expect, it, vi } from "vitest";
vi.mock("@/i18n", () => ({ default: { t: (key: string) => key } }));
vi.mock("@/lib/image-utils", () => ({ readImageMeta: async () => ({ width: 1536, height: 1024, mimeType: "image/png" }) }));
vi.mock("@/services/api/sub2api-image-task", () => ({ rememberSavedTaskImage: vi.fn(async () => {}) }));
import { deleteStoredImages, getImageBlob, setImageBlob, uploadImage } from "@/services/image-storage";

beforeEach(() => {
    vi.stubGlobal("Blob", NativeBlob);
    URL.createObjectURL = vi.fn(() => `blob:fixture-${Math.random()}`);
    URL.revokeObjectURL = vi.fn();
});
it("stores one durable Blob per task and recovers it without the expired source URL", async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, blob: async () => new NativeBlob(["fixture"], { type: "image/png" }) }));
    vi.stubGlobal("fetch", fetchMock);
    const first = await uploadImage("https://fixture.invalid/original", { taskId: "persist-test" });
    const second = await uploadImage("https://fixture.invalid/expired", { taskId: "persist-test" });
    expect(second.storageKey).toBe(first.storageKey);
    expect(second.url).toBe(first.url);
    expect((await getImageBlob(first.storageKey))?.size).toBe(7);
    expect(fetchMock).toHaveBeenCalledTimes(1);
});
it("deletes derived previews together with their original image", async () => {
    const blob = new NativeBlob(["fixture"], { type: "image/png" }) as unknown as Blob;
    const image = await uploadImage(blob);
    await setImageBlob(`${image.storageKey}:preview`, blob);
    await deleteStoredImages([image.storageKey]);
    expect(await getImageBlob(image.storageKey)).toBeNull();
    expect(await getImageBlob(`${image.storageKey}:preview`)).toBeNull();
});
