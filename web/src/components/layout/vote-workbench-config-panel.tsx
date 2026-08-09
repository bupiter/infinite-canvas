import { Alert, App, Button, Input, Modal } from "antd";
import { KeyRound, ShieldCheck, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { clearVoteWorkbenchData } from "@/services/local-data-reset";
import { useConfigStore } from "@/stores/use-config-store";
import { normalizeVoteWorkbenchConfig, VOTE_API_ORIGIN, VOTE_DATA_NOTICE_STORAGE_KEY, VOTE_IMAGE_MODEL } from "@/lib/vote-workbench";
import { validateVoteImageConnection, type VoteImageConnectionFailureReason } from "@/services/api/sub2api-image-task";

type ConnectionStatus = "idle" | "checking" | "success" | VoteImageConnectionFailureReason;

export function VoteWorkbenchConfigPanel({ showDoneButton = false }: { showDoneButton?: boolean }) {
    const { message } = App.useApp();
    const { t } = useTranslation();
    const config = useConfigStore((state) => state.config);
    const setConfigDialogOpen = useConfigStore((state) => state.setConfigDialogOpen);
    const [clearing, setClearing] = useState(false);
    const apiKey = config.channels[0]?.apiKey || "";
    const [draftApiKey, setDraftApiKey] = useState(apiKey);
    const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("idle");
    const validationControllerRef = useRef<AbortController | null>(null);

    useEffect(
        () => () => {
            validationControllerRef.current?.abort();
            validationControllerRef.current = null;
        },
        [],
    );

    const setApiKey = (value: string, verified = false) => {
        useConfigStore.setState({ config: normalizeVoteWorkbenchConfig({ ...config, apiKey: value, voteImageKeyVerified: verified, channels: config.channels.map((channel) => ({ ...channel, apiKey: value })) }) });
    };

    const updateDraftApiKey = (value: string) => {
        validationControllerRef.current?.abort();
        validationControllerRef.current = null;
        setDraftApiKey(value);
        setConnectionStatus("idle");
        if (apiKey) setApiKey("");
    };

    const runConnectionValidation = async () => {
        validationControllerRef.current?.abort();
        const controller = new AbortController();
        validationControllerRef.current = controller;
        setConnectionStatus("checking");
        const result = await validateVoteImageConnection(draftApiKey.trim(), controller.signal);
        if (validationControllerRef.current !== controller) return;
        validationControllerRef.current = null;
        if (!result.ok) {
            setConnectionStatus(result.reason);
            return;
        }
        setApiKey(draftApiKey.trim(), true);
        setConnectionStatus("success");
        message.success(t("voteWorkbench.connectionVerified"));
    };

    const validateConnection = () => {
        if (localStorage.getItem(VOTE_DATA_NOTICE_STORAGE_KEY) === "accepted") {
            void runConnectionValidation();
            return;
        }
        Modal.confirm({
            title: t("voteWorkbench.firstUseTitle"),
            content: (
                <ul className="list-disc space-y-2 pl-5 text-sm">
                    <li>{t("voteWorkbench.firstUseModeration")}</li>
                    <li>{t("voteWorkbench.firstUseStorage")}</li>
                    <li>{t("voteWorkbench.firstUseLocalData")}</li>
                    <li>{t("voteWorkbench.firstUseTask")}</li>
                    <li>{t("voteWorkbench.firstUseBilling")}</li>
                    <li>{t("voteWorkbench.firstUsePolicy")}</li>
                </ul>
            ),
            okText: t("voteWorkbench.firstUseAccept"),
            cancelText: t("common.cancel"),
            onOk: async () => {
                localStorage.setItem(VOTE_DATA_NOTICE_STORAGE_KEY, "accepted");
                await runConnectionValidation();
            },
        });
    };

    const connectionAlert =
        connectionStatus === "success"
            ? { type: "success" as const, message: t("voteWorkbench.connectionVerified") }
            : connectionStatus === "authentication_failed"
              ? { type: "error" as const, message: t("voteWorkbench.authenticationFailed") }
              : connectionStatus === "group_not_image_only"
                ? { type: "error" as const, message: t("voteWorkbench.groupNotImageOnly") }
                : connectionStatus === "service_unavailable"
                  ? { type: "warning" as const, message: t("voteWorkbench.serviceUnavailable") }
                  : null;

    const clearAll = () => {
        Modal.confirm({
            title: t("voteWorkbench.clearAllTitle"),
            content: t("voteWorkbench.clearAllDescription"),
            okText: t("voteWorkbench.clearAll"),
            okButtonProps: { danger: true },
            cancelText: t("common.cancel"),
            onOk: async () => {
                setClearing(true);
                try {
                    await clearVoteWorkbenchData();
                    window.location.reload();
                } finally {
                    setClearing(false);
                }
            },
        });
    };

    return (
        <div className="space-y-5">
            <Alert type="info" showIcon message={t("voteWorkbench.dataNoticeTitle")} description={t("voteWorkbench.dataNotice")} />
            <section className="rounded-lg border border-stone-200 p-4 dark:border-stone-800">
                <div className="mb-4 flex items-center gap-2 text-sm font-semibold">
                    <KeyRound className="size-4" />
                    {t("voteWorkbench.keyTitle")}
                </div>
                <Input.Password visibilityToggle={false} value={draftApiKey} autoComplete="off" placeholder="sk-..." onChange={(event) => updateDraftApiKey(event.target.value)} />
                <div className="mt-3 grid gap-2 text-xs text-stone-500 sm:grid-cols-2">
                    <div>
                        {t("voteWorkbench.apiLabel")}: {VOTE_API_ORIGIN}
                    </div>
                    <div>
                        {t("voteWorkbench.modelLabel")}: {VOTE_IMAGE_MODEL}
                    </div>
                </div>
                {connectionAlert ? <Alert className="mt-3" showIcon type={connectionAlert.type} message={connectionAlert.message} /> : null}
                <div className="mt-4 flex flex-wrap gap-2">
                    <Button type="primary" icon={<ShieldCheck className="size-4" />} disabled={!draftApiKey.trim()} loading={connectionStatus === "checking"} onClick={validateConnection}>
                        {t("voteWorkbench.verifyConnection")}
                    </Button>
                    <Button
                        danger
                        disabled={!draftApiKey}
                        onClick={() => {
                            updateDraftApiKey("");
                            message.success(t("voteWorkbench.keyCleared"));
                        }}
                    >
                        {t("voteWorkbench.clearKey")}
                    </Button>
                    <Button danger icon={<Trash2 className="size-4" />} loading={clearing} onClick={clearAll}>
                        {t("voteWorkbench.clearAll")}
                    </Button>
                </div>
            </section>
            {showDoneButton ? (
                <div className="flex justify-end">
                    <Button type="primary" onClick={() => setConfigDialogOpen(false)}>
                        {t("common.done")}
                    </Button>
                </div>
            ) : null}
        </div>
    );
}
