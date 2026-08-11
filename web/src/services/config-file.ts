import { saveAs } from "file-saver";

import i18n from "@/i18n";
import { normalizeConfigState, useConfigStore, type AiConfig, type WebdavSyncConfig } from "@/stores/use-config-store";
import { normalizePromptSourceState, usePromptSourceStore, type PromptSourceSchedule } from "@/stores/use-prompt-source-store";
import type { PromptSource } from "@/services/api/prompt-source-presets";
import { configWithoutApiKey } from "@/lib/vote-workbench";

type AppConfigFile = {
    app: "infinite-canvas";
    version: 1;
    exportedAt: string;
    config: AiConfig;
    webdav: WebdavSyncConfig;
    promptSources: {
        sources: PromptSource[];
        schedule: PromptSourceSchedule;
    };
};

export function exportAppConfig() {
    const { config, webdav } = useConfigStore.getState();
    const { sources, schedule } = usePromptSourceStore.getState();
    const data: AppConfigFile = { app: "infinite-canvas", version: 1, exportedAt: new Date().toISOString(), config: configWithoutApiKey(config), webdav, promptSources: { sources, schedule } };
    saveAs(new Blob([JSON.stringify(data, null, 2)], { type: "application/json;charset=utf-8" }), "infinite-canvas-config.json");
}

export async function importAppConfig(file: File) {
    let data: AppConfigFile;
    try {
        data = JSON.parse(await file.text()) as AppConfigFile;
    } catch {
        throw new Error(i18n.t("config.invalidFile"));
    }
    if (data.app !== "infinite-canvas" || data.version !== 1 || !data.config || !data.webdav || !data.promptSources) throw new Error(i18n.t("config.invalidFile"));
    const normalizedConfig = normalizeConfigState(data.config, data.webdav);
    const normalizedPrompts = normalizePromptSourceState(data.promptSources.sources, data.promptSources.schedule);
    useConfigStore.setState({ ...normalizedConfig, config: configWithoutApiKey(normalizedConfig.config) });
    usePromptSourceStore.setState(normalizedPrompts);
}
