import { Alert, App, Button, Drawer, Input, Segmented, Select, Space } from "antd";
import { ListPlus, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { isVoteImageBaseUrl, VOTE_DATA_NOTICE_STORAGE_KEY, VOTE_IMAGE_MODEL, VOTE_IMAGE_MODELS } from "@/lib/vote-workbench";
import { validateVoteImageChannel, validateVoteTextChannel } from "@/services/api/vote-image-channel";
import { defaultBaseUrlForApiFormat, guessCapability, normalizeChannelModels, type ApiCallFormat, type ChannelModel, type ModelCapability, type ModelChannel } from "@/stores/use-config-store";
import { ModelScriptEditor } from "./model-script-editor";
import { ModelSelectModal } from "./model-select-modal";
import { VoteChannelConnect } from "./vote-channel-connect";
import { channelPresetFor, channelPresets, type ChannelPreset } from "@/lib/vote-channel-presets";

type ScriptTarget = { name: string; capability: ModelCapability; value: string };

export function ChannelEditorDrawer({ open, channel, onSave, onClose }: { open: boolean; channel: ModelChannel | null; onSave: (channel: ModelChannel) => void; onClose: () => void }) {
    const { message, modal } = App.useApp();
    const { t } = useTranslation();
    const [draft, setDraft] = useState<ModelChannel | null>(channel);
    const [selectOpen, setSelectOpen] = useState(false);
    const [scriptTarget, setScriptTarget] = useState<ScriptTarget | null>(null);
    const [saving, setSaving] = useState(false);
    const [connectionRevision, setConnectionRevision] = useState(0);
    const validationControllerRef = useRef<AbortController | null>(null);
    const apiFormatOptions: Array<{ label: string; value: ApiCallFormat }> = [
        { label: "OpenAI", value: "openai" },
        { label: "Gemini", value: "gemini" },
    ];
    const capabilityOptions: Array<{ label: string; value: ModelCapability }> = ["image", "video", "text", "audio"].map((value) => ({ label: t(`config.channelEditor.capabilities.${value}`), value: value as ModelCapability }));

    useEffect(() => {
        if (!open || !channel) return;
        validationControllerRef.current?.abort();
        validationControllerRef.current = null;
        setSaving(false);
        setDraft(channel);
    }, [open, channel]);

    useEffect(
        () => () => {
            validationControllerRef.current?.abort();
        },
        [],
    );

    if (!draft) return null;

    const patch = (value: Partial<ModelChannel>) => {
        if ("baseUrl" in value && value.baseUrl !== draft.baseUrl) value = { ...value, apiKey: "", models: [], managedKeyId: undefined, keyOwnerId: undefined, imageParameterMode: undefined, imageGroupId: undefined };
        if ("apiKey" in value && !("managedKeyId" in value)) { value = { ...value, managedKeyId: undefined, keyOwnerId: undefined, imageParameterMode: undefined, imageGroupId: undefined }; setConnectionRevision(n => n + 1); }
        if ("baseUrl" in value || "apiKey" in value) {
            validationControllerRef.current?.abort();
            validationControllerRef.current = null;
            setSaving(false);
        }
        setDraft((current) => (current ? { ...current, ...value } : current));
    };
    const setModels = (models: ChannelModel[]) => patch({ models });

    const changeApiFormat = (apiFormat: ApiCallFormat) => {
        const baseUrl = !draft.baseUrl.trim() || draft.baseUrl.trim() === defaultBaseUrlForApiFormat(draft.apiFormat) ? defaultBaseUrlForApiFormat(apiFormat) : draft.baseUrl;
        patch({ apiFormat, baseUrl });
    };

    const applySelection = (names: string[]) => {
        const map = new Map(draft.models.map((model) => [model.name, model]));
        setModels(names.map((name) => map.get(name) || { name, capability: guessCapability(name) }));
    };

    const setCapability = (name: string, capability: ModelCapability) => setModels(draft.models.map((model) => (model.name === name ? { ...model, capability } : model)));
    const setScript = (name: string, script: string) => setModels(draft.models.map((model) => (model.name === name ? { ...model, script: script || undefined } : model)));
    const removeModel = (name: string) => setModels(draft.models.filter((model) => model.name !== name));

    const close = () => {
        validationControllerRef.current?.abort();
        validationControllerRef.current = null;
        onClose();
    };

    const confirmVoteNotice = () => {
        if (localStorage.getItem(VOTE_DATA_NOTICE_STORAGE_KEY) === "accepted") return Promise.resolve(true);
        return new Promise<boolean>((resolve) => {
            let settled = false;
            const settle = (accepted: boolean) => {
                if (settled) return;
                settled = true;
                resolve(accepted);
            };
            modal.confirm({
                title: t("voteWorkbench.firstUseTitle"),
                content: (
                    <ul className="list-disc space-y-2 pl-5 text-sm">
                        <li>{t("voteWorkbench.firstUseData")}</li>
                        <li>{t("voteWorkbench.firstUseModeration")}</li>
                        <li>{t("voteWorkbench.firstUseBilling")}</li>
                        <li>{t("voteWorkbench.firstUsePolicy")}</li>
                    </ul>
                ),
                okText: t("voteWorkbench.firstUseAccept"),
                cancelText: t("common.cancel"),
                onOk: () => {
                    localStorage.setItem(VOTE_DATA_NOTICE_STORAGE_KEY, "accepted");
                    settle(true);
                },
                onCancel: () => settle(false),
                afterClose: () => settle(false),
            });
        });
    };

    const save = async () => {
        const normalized = { ...draft, name: draft.name.trim() || t("config.channels.unnamed"), baseUrl: draft.baseUrl.trim(), models: normalizeChannelModels(draft.models) };
        const kind = channelPresetFor(normalized.baseUrl);
        if (kind === "custom") {
            onSave(normalized);
            close();
            return;
        }
        if (!normalized.apiKey.trim()) {
            message.error(t("config.modelSelect.missingConfig"));
            return;
        }
        if (kind === "image" && !normalized.imageParameterMode) {
            message.error("请重新选择生图 Key；手动接入需在高级设置中选择图像参数模式。");
            return;
        }
        if (kind === "image" && !(await confirmVoteNotice())) return;

        const controller = new AbortController();
        validationControllerRef.current?.abort();
        validationControllerRef.current = controller;
        setSaving(true);
        try {
            const supportedModels = kind === "image" ? await validateVoteImageChannel(normalized, controller.signal) : await validateVoteTextChannel(normalized, controller.signal);
            if (validationControllerRef.current !== controller) return;
            onSave({ ...normalized, apiFormat: "openai", apiKey: normalized.apiKey.trim(), models: supportedModels.map((name) => ({ name, capability: kind })) });
            message.success(t("voteWorkbench.connectionVerified"));
            close();
        } catch (error) {
            if (validationControllerRef.current !== controller) return;
            message.error(error instanceof Error ? error.message : t("voteWorkbench.serviceUnavailable"));
        } finally {
            if (validationControllerRef.current === controller) {
                validationControllerRef.current = null;
                setSaving(false);
            }
        }
    };

    const voteChannel = isVoteImageBaseUrl(draft.baseUrl);
    const preset = channelPresetFor(draft.baseUrl);
    const choosePreset = (kind: ChannelPreset) => {
        patch(kind === "custom" ? { baseUrl: "", name: "自定义渠道", apiFormat: "openai" } : { ...channelPresets[kind], apiFormat: "openai" });
    };

    return (
        <Drawer
            open={open}
            width={640}
            title={t("config.channelEditor.title")}
            onClose={close}
            styles={{ body: { paddingTop: 16 } }}
            footer={<Button type="primary" block size="large" loading={saving} onClick={() => void save()}>{preset === "custom" ? t("common.save") : "连接并开始使用"}</Button>}
            extra={
                <Space>
                    <Button onClick={close}>{t("common.cancel")}</Button>
                    <Button type="primary" loading={saving} onClick={() => void save()}>
                        {preset === "custom" ? t("common.save") : "连接并开始使用"}
                    </Button>
                </Space>
            }
        >
            <div className="mb-4 space-y-2">
                <div className="text-sm font-semibold">1. 选择渠道用途</div>
                <Select className="w-full" aria-label="渠道用途" value={preset} onChange={choosePreset} options={[
                    { value: "image", label: "Vote 生图 · 生成图片、修改图片" },
                    { value: "text", label: "Vote 文本 · 对话、提示词助手" },
                    { value: "custom", label: "自定义 · 接入其他服务商" },
                ]} />
                {preset !== "custom" && <Input aria-label="自动填写的接口地址" readOnly value={draft.baseUrl} />}
                <p className="text-xs text-stone-500">Vote 渠道自动填写接口地址。先连接生图即可开始，文本渠道可按需添加。</p>
            </div>
            <VoteChannelConnect key={`${draft.id}:${draft.baseUrl}:${connectionRevision}`} channel={draft} onChange={patch} />
            {voteChannel ? <Alert className="mb-4" type="info" showIcon message={t("voteWorkbench.dataNoticeTitle")} description={t("voteWorkbench.dataNotice")} /> : null}
            <details open={preset === "custom"} className="mb-4">
            <summary className="mb-3 cursor-pointer text-sm font-medium">高级设置 / 手动填写密钥</summary>
            <div className="grid gap-4 md:grid-cols-2">
                <label className="block">
                    <span className="mb-1 block text-sm font-medium">{t("config.channelEditor.name")}</span>
                    <Input value={draft.name} onChange={(event) => patch({ name: event.target.value })} />
                </label>
                <label className="block">
                    <span className="mb-1 block text-sm font-medium">{t("config.channelEditor.protocol")}</span>
                    <Select className="w-full" disabled={preset !== "custom"} value={draft.apiFormat} options={apiFormatOptions} onChange={changeApiFormat} />
                </label>
                <label className="block md:col-span-2">
                    <span className="mb-1 block text-sm font-medium">{t("config.channelEditor.baseUrl")}</span>
                    <Input readOnly={preset !== "custom"} value={draft.baseUrl} onChange={(event) => patch({ baseUrl: event.target.value })} placeholder="https://api.example.com/v1" />
                </label>
                <label className="block md:col-span-2">
                    <span className="mb-1 block text-sm font-medium">{preset === "custom" ? "API Key" : "手动粘贴 API Key（也可使用上方下拉框）"}</span>
                    <Input.Password visibilityToggle={false} value={draft.apiKey} onChange={(event) => patch({ apiKey: event.target.value })} placeholder="sk-..." />
                </label>
                {preset === "image" && <label className="block md:col-span-2">
                    <span className="mb-1 block text-sm font-medium">图像参数模式{draft.managedKeyId ? "（由分组自动确定）" : "（按服务商能力选择）"}</span>
                    <Select className="w-full" disabled={Boolean(draft.managedKeyId)} value={draft.imageParameterMode} placeholder="请选择参数模式" options={[
                        { value: "standard", label: "原生 / 标准参数：画质、尺寸和透明背景" },
                        { value: "fixed", label: "固定输出：尺寸和画质由上游处理" },
                    ]} onChange={mode => patch({ imageParameterMode: mode })} />
                </label>}
            </div>
            </details>

            <div className="mt-6 mb-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                    <div className="text-sm font-semibold">3. {t("config.channelEditor.models")}</div>
                    <div className="mt-0.5 text-xs text-stone-500">{t("config.channelEditor.modelDescription", { count: draft.models.length })}</div>
                </div>
                <Button type="primary" icon={<ListPlus className="size-4" />} onClick={() => setSelectOpen(true)}>
                    {t("config.channelEditor.selectModels")}
                </Button>
            </div>

            <div className="space-y-2 rounded-lg border border-stone-200 p-2 dark:border-stone-800">
                {draft.models.length ? (
                    draft.models.map((model) => (
                        <div key={model.name} className="flex flex-wrap items-center gap-3 rounded-md px-2 py-1.5 hover:bg-stone-50 dark:hover:bg-stone-900/40">
                            <span className="min-w-0 flex-1 truncate text-sm" title={model.name}>
                                {model.name}
                            </span>
                            <div className="flex shrink-0 items-center gap-2">
                                <Segmented size="small" value={model.capability} options={capabilityOptions} onChange={(value) => setCapability(model.name, value as ModelCapability)} />
                                <Button size="small" type={model.script ? "primary" : "default"} ghost={Boolean(model.script)} onClick={() => setScriptTarget({ name: model.name, capability: model.capability, value: model.script || "" })}>
                                    {t(model.script ? "config.channelEditor.scriptReady" : "config.channelEditor.script")}
                                </Button>
                                <Button size="small" danger type="text" icon={<Trash2 className="size-3.5" />} onClick={() => removeModel(model.name)} />
                            </div>
                        </div>
                    ))
                ) : (
                    <div className="px-2 py-8 text-center text-sm text-stone-500">{t("config.channelEditor.empty")}</div>
                )}
            </div>

            <ModelSelectModal open={selectOpen} channel={draft} selectedNames={draft.models.map((model) => model.name)} onConfirm={applySelection} onClose={() => setSelectOpen(false)} />

            <ModelScriptEditor
                open={Boolean(scriptTarget)}
                capability={scriptTarget?.capability || "text"}
                modelName={scriptTarget?.name || ""}
                value={scriptTarget?.value || ""}
                onSave={(script) => scriptTarget && setScript(scriptTarget.name, script)}
                onClose={() => setScriptTarget(null)}
            />
        </Drawer>
    );
}
