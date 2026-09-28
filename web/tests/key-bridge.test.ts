import { afterEach, expect, it, vi } from "vitest";
const store = vi.hoisted(() => ({ config: { channels: [{ id: "managed", apiKey: "old-owner-key", managedKeyId: 1, keyOwnerId: 9 }] }, updateConfig: vi.fn() }));
vi.mock("@/stores/use-config-store", () => ({ useConfigStore: { getState: () => store } }));
import { startVoteKeyBridge, getVoteKeyOwner, requestVoteKeyBridge } from "@/services/vote-key-bridge";
let cleanup: (() => void) | undefined;
function setup() {
    const parent = { postMessage: vi.fn() };
    const addEventListener = vi.fn();
    vi.stubGlobal("window", { location: { origin: "https://canvas.vote520.com" }, parent, addEventListener, removeEventListener: vi.fn() });
    cleanup = startVoteKeyBridge();
    const receive = addEventListener.mock.calls[0]![1];
    const send = (data: object, origin = "https://ai.vote520.com", source = parent) => receive({ origin, source, data: { protocol: "vote-canvas-keys-v1", ...data } });
    return { parent, send, hello: parent.postMessage.mock.calls[0]![0] };
}
afterEach(() => { cleanup?.(); cleanup = undefined; vi.unstubAllGlobals(); vi.clearAllMocks(); });
it("ignores forged ready messages and clears credentials from another account", () => {
    const s = setup();
    s.send({ id: s.hello.id, action: "hello", ok: true, userId: 7 }, "https://evil.invalid"); expect(getVoteKeyOwner()).toBe(0);
    s.send({ id: s.hello.id, action: "hello", ok: true, userId: 7 }); expect(getVoteKeyOwner()).toBe(7);
    expect(store.updateConfig).toHaveBeenCalledWith("channels", [expect.objectContaining({ apiKey: "", managedKeyId: undefined })]);
});
it("accepts a response only from the parent origin with the matching request ID", async () => {
    const s = setup(); s.send({ id: s.hello.id, action: "hello", ok: true, userId: 7 });
    const controller = new AbortController(); const promise = requestVoteKeyBridge("select", "image", controller.signal, 3);
    const request = s.parent.postMessage.mock.lastCall![0]; let resolved = false; promise.then(() => { resolved = true; });
    s.send({ id: request.id, ok: true, userId: 7, key: "bad" }, "https://evil.invalid"); await Promise.resolve(); expect(resolved).toBe(false);
    s.send({ id: request.id, ok: true, userId: 7, key: "fixture-only" }); await expect(promise).resolves.toMatchObject({ key: "fixture-only" });
    expect(s.parent.postMessage.mock.lastCall![1]).toBe("https://ai.vote520.com");
});
it("rejects pending selections on logout and does not loop a handshake", async () => {
    const s = setup(); s.send({ id: s.hello.id, action: "hello", ok: true, userId: 7 });
    const promise = requestVoteKeyBridge("select", "text", new AbortController().signal, 3); const assertion = expect(promise).rejects.toThrow("登录状态");
    const count = s.parent.postMessage.mock.calls.length; s.send({ action: "reset", userId: 0 }); await assertion;
    expect(getVoteKeyOwner()).toBe(0); expect(s.parent.postMessage.mock.calls.length).toBe(count);
});
it("aborts stale selections when the channel changes", async () => {
    const s = setup(); s.send({ id: s.hello.id, action: "hello", ok: true, userId: 7 });
    const controller = new AbortController(); const promise = requestVoteKeyBridge("select", "image", controller.signal, 3);
    const assertion = expect(promise).rejects.toThrow("已取消"); controller.abort(); await assertion;
});
