import { useConfigStore } from "@/stores/use-config-store";
import { channelPresetFor } from "@/lib/vote-channel-presets";
import { imageModeForGroup } from "@/services/api/vote-image-profile";
import { validateVoteImageChannel } from "@/services/api/vote-image-channel";

const protocol = "vote-canvas-keys-v1";
export type VoteChannelKind = "image" | "text";
export type VoteKeyChoice = { id: number; name: string; group: string; suffix: string; reason: string };
const parents: Record<string, string> = {
    "https://canvas.vote520.com": "https://ai.vote520.com",
    "https://hermes.vote520.com:19445": "https://hermes.vote520.com:19443",
};
let owner = 0;
const listeners = new Set<() => void>();
const pending = new Map<string, { resolve: (value: any) => void; reject: (reason: Error) => void }>();
export const getVoteKeyOwner = () => owner;
export const subscribeVoteKeyOwner = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };
export const voteAccountOrigin = () => parents[window.location.origin] || "https://ai.vote520.com";

function setOwner(next: number) {
    owner = next;
    const store = useConfigStore.getState();
    const channels = store.config.channels;
    if (channels.some(c => c.managedKeyId && c.keyOwnerId !== next)) {
        store.updateConfig("channels", channels.map(c => c.managedKeyId && c.keyOwnerId !== next ? { ...c, apiKey: "", managedKeyId: next ? undefined : c.managedKeyId, keyOwnerId: next ? undefined : c.keyOwnerId } : c));
    }
    listeners.forEach(fn => fn());
}

export function requestVoteKeyBridge<T>(action: "list" | "select", kind: VoteChannelKind, signal: AbortSignal, keyId?: number): Promise<T> {
    if (!owner || !parents[window.location.origin] || window.parent === window) return Promise.reject(new Error("请从主站的图片工作站进入，或手动粘贴 API Key。"));
    if (signal.aborted) return Promise.reject(new DOMException("已取消", "AbortError"));
    return new Promise((resolve, reject) => {
        const id = crypto.randomUUID();
        const abort = () => { pending.delete(id); reject(new DOMException("已取消", "AbortError")); };
        signal.addEventListener("abort", abort, { once: true });
        const finish = () => { signal.removeEventListener("abort", abort); pending.delete(id); };
        pending.set(id, { resolve: value => { finish(); resolve(value); }, reject: error => { finish(); reject(error); } });
        window.parent.postMessage({ protocol, action, kind, keyId, id }, parents[window.location.origin]);
    });
}

export function startVoteKeyBridge() {
    if (window.parent === window || !parents[window.location.origin]) return () => {};
    setOwner(0);
    let recovery = new AbortController();
    const restoreSelectedKeys = async () => {
        recovery.abort(); recovery = new AbortController();
        const signal = recovery.signal, currentOwner = owner;
        for (const channel of useConfigStore.getState().config.channels) {
            const kind = channelPresetFor(channel.baseUrl);
            if (kind === "custom" || !channel.managedKeyId || channel.keyOwnerId !== currentOwner) continue;
            try {
                const list = await requestVoteKeyBridge<{ keys: VoteKeyChoice[] }>("list", kind, signal);
                if (!list.keys.some(key => key.id === channel.managedKeyId && !key.reason)) continue;
                const selected = await requestVoteKeyBridge<{ key: string; groupId?: number }>("select", kind, signal, channel.managedKeyId);
                const imageParameterMode = kind === "image" ? await imageModeForGroup(selected.groupId) : undefined;
                if (kind === "image" && !imageParameterMode) continue;
                const supported = kind === "image" ? await validateVoteImageChannel({ ...channel, apiKey: selected.key }, signal) : undefined;
                if (signal.aborted || owner !== currentOwner) return;
                const store = useConfigStore.getState();
                store.updateConfig("channels", store.config.channels.map(c => c.id === channel.id && c.baseUrl === channel.baseUrl && c.managedKeyId === channel.managedKeyId && c.keyOwnerId === currentOwner ? { ...c, apiKey: selected.key, imageParameterMode, imageGroupId: kind === "image" ? selected.groupId : undefined, models: supported ? supported.map(name => ({ ...c.models.find(model => model.name === name), name, capability: "image" as const })) : c.models } : c));
            } catch { /* Keep the key cleared; the editor provides a manual reconnect action. */ }
        }
    };
    let helloId = crypto.randomUUID();
    const receive = (event: MessageEvent) => {
        const data = event.data;
        if (event.source !== window.parent || event.origin !== parents[window.location.origin] || data?.protocol !== protocol) return;
        if (data.action === "reset") {
            recovery.abort();
            setOwner(0);
            for (const request of [...pending.values()]) request.reject(new Error("登录状态已变化，请重新连接主站。"));
            if (Number.isSafeInteger(data.userId) && data.userId > 0) {
                helloId = crypto.randomUUID();
                window.parent.postMessage({ protocol, action: "hello", id: helloId }, parents[window.location.origin]);
            }
            return;
        }
        if (data.id === helloId && data.action === "hello" && data.ok && Number.isSafeInteger(data.userId) && data.userId > 0) { setOwner(data.userId); void restoreSelectedKeys(); return; }
        const request = pending.get(data.id);
        if (!request) return;
        if (data.userId !== owner || !data.ok) request.reject(new Error("读取失败，请刷新列表并检查登录、分组权限或密钥状态。"));
        else request.resolve(data);
    };
    window.addEventListener("message", receive);
    window.parent.postMessage({ protocol, action: "hello", id: helloId }, parents[window.location.origin]);
    return () => {
        recovery.abort();
        window.removeEventListener("message", receive);
        for (const request of [...pending.values()]) request.reject(new Error("主站连接已关闭。"));
        owner = 0;
    };
}
