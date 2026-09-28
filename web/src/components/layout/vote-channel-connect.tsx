import { Alert, Button, Select, Space } from "antd";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import axios from "axios";
import { channelPresetFor } from "@/lib/vote-channel-presets";
import { type ModelChannel } from "@/stores/use-config-store";
import { validateVoteImageChannel, validateVoteTextChannel } from "@/services/api/vote-image-channel";
import { getVoteKeyOwner, requestVoteKeyBridge, subscribeVoteKeyOwner, voteAccountOrigin, type VoteKeyChoice } from "@/services/vote-key-bridge";

export function VoteChannelConnect({ channel, onChange }: { channel: ModelChannel; onChange: (patch: Partial<ModelChannel>) => void }) {
    const owner = useSyncExternalStore(subscribeVoteKeyOwner, getVoteKeyOwner);
    const [choices, setChoices] = useState<VoteKeyChoice[]>([]);
    const [loading, setLoading] = useState(false);
    const [status, setStatus] = useState("");
    const [refresh, setRefresh] = useState(0);
    const operation = useRef<AbortController | null>(null);
    const kind = channelPresetFor(channel.baseUrl);
    useEffect(() => {
        if (channel.managedKeyId && channel.keyOwnerId !== owner) onChange({ apiKey: "", models: [], managedKeyId: undefined, keyOwnerId: undefined });
    }, [owner]);
    useEffect(() => {
        operation.current?.abort(); setChoices([]); setStatus(""); setLoading(false);
        if (!owner || kind === "custom") return;
        const controller = new AbortController(); operation.current = controller; setLoading(true);
        requestVoteKeyBridge<{ keys: VoteKeyChoice[] }>("list", kind, controller.signal).then(result => {
            if (!controller.signal.aborted) { setChoices(result.keys); if (!result.keys.length) setStatus("还没有对应分组的密钥。请在主站创建后点击刷新。"); }
        }).catch(() => { if (!controller.signal.aborted) setStatus("读取失败，请确认主站登录状态后刷新。"); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
        return () => controller.abort();
    }, [kind, channel.baseUrl, owner, refresh]);
    useEffect(() => () => operation.current?.abort(), []);
    const select = async (keyId: number) => {
        if (kind === "custom") return;
        operation.current?.abort(); const controller = new AbortController(); operation.current = controller;
        setLoading(true); setStatus("正在验证密钥并读取模型，不会产生生图费用…");
        onChange({ apiKey: "", models: [], managedKeyId: undefined, keyOwnerId: undefined });
        try {
            const selected = await requestVoteKeyBridge<{ key: string; keyId: number; userId: number }>("select", kind, controller.signal, keyId);
            if (controller.signal.aborted) return;
            const candidate = { ...channel, apiKey: selected.key, apiFormat: "openai" as const };
            let names: string[];
            if (kind === "image") names = await validateVoteImageChannel(candidate, controller.signal);
            else {
                names = await validateVoteTextChannel(candidate, controller.signal);
            }
            if (controller.signal.aborted || getVoteKeyOwner() !== selected.userId) return;
            onChange({ apiKey: selected.key, managedKeyId: selected.keyId, keyOwnerId: selected.userId, apiFormat: "openai", models: names.map(name => ({ name, capability: kind })) });
            setStatus(`连接通过，已读取 ${names.length} 个${kind === "image" ? "生图" : "文本"}模型。点击底部“连接并开始使用”即可。`);
        } catch (error) {
            if (!controller.signal.aborted) setStatus(error instanceof Error && !axios.isAxiosError(error) ? error.message : "连接失败，请检查密钥、分组权限及网络后重新选择。");
        } finally { if (!controller.signal.aborted) setLoading(false); }
    };
    if (kind === "custom") return null;
    return <div className="mb-4 space-y-3">
        <div className="text-sm font-semibold">2. 选择我的 API Key</div>
        {owner ? <Space.Compact className="w-full">
            <Select className="min-w-0 flex-1" aria-label="选择我的 API Key" placeholder="选择对应分组的密钥" loading={loading} value={channel.managedKeyId} onChange={id => void select(id)}
                options={choices.map(key => ({ value: key.id, disabled: Boolean(key.reason), label: `${key.name} · ${key.group} · 尾号 ${key.suffix}${key.reason ? ` · ${key.reason}` : ""}` }))} />
            <Button onClick={() => setRefresh(n => n + 1)}>刷新</Button>
        </Space.Compact> : <Alert type="info" showIcon title="自动选择 Key 需要从主站的“图片工作站”进入" description="直接打开画布时，可以在下方手动粘贴自己的平台 Key。" />}
        <a className="text-sm underline" href={`${voteAccountOrigin()}/keys`} target="_blank" rel="noopener noreferrer">管理 / 创建{kind === "image" ? "生图" : "文本"}密钥 ↗</a>
        <p className="text-xs text-stone-500">在主站选择对应分组创建密钥，返回这里点击“刷新”。下拉框仅列出你自己账号的密钥。</p>
        {status && <p role="status" className="text-sm">{status}</p>}
    </div>;
}
