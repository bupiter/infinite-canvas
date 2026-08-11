import { Alert, App, Button, Drawer, Input, Segmented, Select, Space } from "antd";
import { ListPlus, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { isVoteImageBaseUrl, VOTE_DATA_NOTICE_STORAGE_KEY, VOTE_IMAGE_MODEL } from "@/lib/vote-workbench";
import { validateVoteImageChannel } from "@/services/api/vote-image-channel";
import { defaultBaseUrlForApiFormat, guessCapability, normalizeChannelModels, type ApiCallFormat, type ChannelModel, type ModelCapability, type ModelChannel } from "@/stores/use-config-store";
import { ModelScriptEditor } from "./model-script-editor";
import { ModelSelectModal } from "./model-select-modal";

type ScriptTarget = { name: string; capability: ModelCapability; value: string };

export function ChannelEditorDrawer({ open, channel, onSave, onClose }: { open: boolean; channel: ModelChannel | null; onSave: (channel: ModelChannel) => void; onClose: () => void }) {
    const { message, modal } = App.useApp();
    const { t } = useTranslation();
    const [draft, setDraft] = useState<ModelChannel | null>(channel);
    const [selectOpen, setSelectOpen] = useState(false);
    const [scriptTarget, setScriptTarget] = useState<ScriptTarget | null>(null);
    const [saving, setSaving] = useState(false);
    const validationControllerRef = useRef<AbortController | null>(null);
    const apiFormatOptions: Array<{ label: string; value: ApiCallFormat }> = [
        { label: "OpenAI", value: "openai" },
        { label: "Gemini", value: "gemini" },
        { label: t("config.protocols.ark"), value: "ark" },
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
        if (!isVoteImageBaseUrl(normalized.baseUrl)) {
            onSave(normalized);
            close();
            return;
        }
        if (!normalized.apiKey.trim()) {
            message.error(t("config.modelSelect.missingConfig"));
            return;
        }
        if (!(await confirmVoteNotice())) return;

        const controller = new AbortController();
        validationControllerRef.current?.abort();
        validationControllerRef.current = controller;
        setSaving(true);
        try {
            await validateVoteImageChannel(normalized, controller.signal);
            if (validationControllerRef.current !== controller) return;
            const existing = normalized.models.find((model) => model.name === VOTE_IMAGE_MODEL);
            onSave({ ...normalized, apiFormat: "openai", apiKey: normalized.apiKey.trim(), models: [{ ...existing, name: VOTE_IMAGE_MODEL, capability: "image" }] });
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

    return (
        <Drawer
            open={open}
            width={640}
            title={t("config.channelEditor.title")}
            onClose={close}
            styles={{ body: { paddingTop: 16 } }}
            extra={
                <Space>
                    <Button onClick={close}>{t("common.cancel")}</Button>
                    <Button type="primary" loading={saving} onClick={() => void save()}>
                        {t("common.save")}
                    </Button>
                </Space>
            }
        >
            {voteChannel ? <Alert className="mb-4" type="info" showIcon message={t("voteWorkbench.dataNoticeTitle")} description={t("voteWorkbench.dataNotice")} /> : null}
            <div className="grid gap-4 md:grid-cols-2">
                <label className="block">
                    <span className="mb-1 block text-sm font-medium">{t("config.channelEditor.name")}</span>
                    <Input value={draft.name} onChange={(event) => patch({ name: event.target.value })} />
                </label>
                <label className="block">
                    <span className="mb-1 block text-sm font-medium">{t("config.channelEditor.protocol")}</span>
                    <Select className="w-full" value={draft.apiFormat} options={apiFormatOptions} onChange={changeApiFormat} />
                </label>
                <label className="block md:col-span-2">
                    <span className="mb-1 block text-sm font-medium">{t("config.channelEditor.baseUrl")}</span>
                    <Input value={draft.baseUrl} onChange={(event) => patch({ baseUrl: event.target.value })} placeholder="https://api.example.com" />
                </label>
                <label className="block md:col-span-2">
                    <span className="mb-1 block text-sm font-medium">API Key</span>
                    <Input.Password visibilityToggle={false} value={draft.apiKey} onChange={(event) => patch({ apiKey: event.target.value })} placeholder="sk-..." />
                </label>
            </div>

            <div className="mt-6 mb-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                    <div className="text-sm font-semibold">{t("config.channelEditor.models")}</div>
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
