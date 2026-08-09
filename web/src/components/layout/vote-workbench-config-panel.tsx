import { Alert, App, Button, Input, Modal } from "antd";
import { KeyRound, Trash2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { clearVoteWorkbenchData } from "@/services/local-data-reset";
import { useConfigStore } from "@/stores/use-config-store";
import { normalizeVoteWorkbenchConfig, VOTE_API_ORIGIN, VOTE_IMAGE_MODEL } from "@/lib/vote-workbench";

export function VoteWorkbenchConfigPanel({ showDoneButton = false }: { showDoneButton?: boolean }) {
    const { message } = App.useApp();
    const { t } = useTranslation();
    const config = useConfigStore((state) => state.config);
    const setConfigDialogOpen = useConfigStore((state) => state.setConfigDialogOpen);
    const [clearing, setClearing] = useState(false);
    const apiKey = config.channels[0]?.apiKey || "";

    const setApiKey = (value: string) => {
        useConfigStore.setState({ config: normalizeVoteWorkbenchConfig({ ...config, apiKey: value, channels: config.channels.map((channel) => ({ ...channel, apiKey: value })) }) });
    };

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
                <Input.Password value={apiKey} autoComplete="off" placeholder="sk-..." onChange={(event) => setApiKey(event.target.value)} />
                <div className="mt-3 grid gap-2 text-xs text-stone-500 sm:grid-cols-2">
                    <div>{t("voteWorkbench.apiLabel")}: {VOTE_API_ORIGIN}</div>
                    <div>{t("voteWorkbench.modelLabel")}: {VOTE_IMAGE_MODEL}</div>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                    <Button danger disabled={!apiKey} onClick={() => { setApiKey(""); message.success(t("voteWorkbench.keyCleared")); }}>
                        {t("voteWorkbench.clearKey")}
                    </Button>
                    <Button danger icon={<Trash2 className="size-4" />} loading={clearing} onClick={clearAll}>
                        {t("voteWorkbench.clearAll")}
                    </Button>
                </div>
            </section>
            {showDoneButton ? (
                <div className="flex justify-end">
                    <Button type="primary" onClick={() => setConfigDialogOpen(false)}>{t("common.done")}</Button>
                </div>
            ) : null}
        </div>
    );
}
