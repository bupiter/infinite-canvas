import React, { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import axios from "axios";
import type { ModelChannel } from "@/stores/use-config-store";
const bridge = vi.hoisted(() => ({ owner: 7, request: vi.fn() }));
vi.mock("@/services/vote-key-bridge", () => ({ getVoteKeyOwner: () => bridge.owner, subscribeVoteKeyOwner: () => () => {}, voteAccountOrigin: () => "https://ai.vote520.com", requestVoteKeyBridge: bridge.request }));
vi.mock("@/stores/use-config-store", () => ({ buildApiUrl: (base: string, path: string) => `${base.replace(/\/$/, "")}${base.endsWith("/v1") ? "" : "/v1"}${path}`, guessCapability: (name: string) => name.startsWith("gpt-image-") ? "image" : "text" }));
vi.mock("@/i18n", () => ({ default: { t: (key: string) => key } }));
vi.mock("antd", () => ({
    Alert: ({ title, description }: any) => <div>{title}{description}</div>,
    Button: ({ children, onClick }: any) => <button onClick={onClick}>{children}</button>,
    Select: ({ options, onChange, value }: any) => <select aria-label="keys" value={value || ""} onChange={e => onChange(Number(e.target.value))}><option value="">选择</option>{options.map((o: any) => <option key={o.value} value={o.value} disabled={o.disabled}>{o.label}</option>)}</select>,
    Space: { Compact: ({ children }: any) => <div>{children}</div> },
}));
import { VoteChannelConnect } from "@/components/layout/vote-channel-connect";
import { channelPresetFor, channelPresets } from "@/lib/vote-channel-presets";
let root: ReturnType<typeof createRoot>;
let container: HTMLDivElement;
let saved: ModelChannel;
function Wrapper({ kind }: { kind: "image" | "text" }) {
    const [channel, setChannel] = useState<ModelChannel>({ id: "test", apiFormat: "openai", apiKey: "", models: [], ...channelPresets[kind] });
    saved = channel;
    return <VoteChannelConnect channel={channel} onChange={patch => setChannel(c => ({ ...c, ...patch }))} />;
}
beforeEach(() => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    bridge.owner = 7;
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ version: 1, api_origin: "https://image.vote520.com", groups: { "34": "standard", "21": "fixed" } }))));
    bridge.request.mockReset().mockImplementation(async action => action === "list" ? { keys: [{ id: 3, name: "我的密钥", group: "分组", suffix: "test", reason: "" }, { id: 4, name: "旧密钥", group: "分组", suffix: "xxxx", reason: "已过期" }] } : { key: "sk-fixture-only", keyId: 3, userId: 7, groupId: 34 });
    container = document.createElement("div"); root = createRoot(container);
});
afterEach(async () => { await act(() => root.unmount()); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
it.each(["image", "text"] as const)("selects a %s key and reads models without a paid request", async kind => {
    const model = kind === "image" ? "gpt-image-2" : "gpt-6-astra";
    const get = vi.spyOn(axios, "get").mockResolvedValue({ data: { data: [{ id: model }] } });
    const post = vi.spyOn(axios, "post");
    await act(async () => root.render(<Wrapper kind={kind} />));
    expect(container.textContent).toContain("我的密钥"); expect(container.textContent).not.toContain("sk-fixture-only");
    const select = container.querySelector("select")!;
    await act(async () => { select.value = "3"; select.dispatchEvent(new Event("change", { bubbles: true })); });
    expect(saved.apiKey).toBe("sk-fixture-only"); expect(saved.models).toEqual([{ name: model, capability: kind }]);
    expect(get.mock.calls[0]![0]).toBe(channelPresets[kind].baseUrl + "/models"); expect(post).not.toHaveBeenCalled();
    expect(container.textContent).toContain("连接通过"); expect(container.querySelector('option[value="4"]')?.hasAttribute("disabled")).toBe(true);
});
it("explains manual setup when opened outside the authenticated workbench", async () => {
    bridge.owner = 0; await act(async () => root.render(<Wrapper kind="image" />));
    expect(bridge.request).not.toHaveBeenCalled(); expect(container.textContent).toContain("手动粘贴");
});
it("rejects credential-bearing URLs and lookalike provider addresses", () => {
    expect(channelPresetFor("https://image.vote520.com/v1")).toBe("image");
    expect(channelPresetFor("https://ai.vote520.com")).toBe("text");
    for (const url of ["https://image.vote520.com.evil.invalid/v1", "https://user:pass@image.vote520.com/v1", "https://image.vote520.com/v1?token=test", "http://image.vote520.com"]) expect(channelPresetFor(url)).toBe("custom");
});
