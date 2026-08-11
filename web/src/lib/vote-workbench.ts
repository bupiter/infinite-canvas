import type { AiConfig } from "@/stores/use-config-store";

export const VOTE_API_ORIGIN = "https://image.vote520.com";
export const VOTE_IMAGE_MODEL = "gpt-image-2";
export const VOTE_DATA_NOTICE_STORAGE_KEY = "infinite-canvas:vote-data-notice:v1";
const EMBEDDED_SESSION_KEY = "vote-canvas:embedded";

export type VoteWorkbenchQueryPreferences = {
    locale?: "zh-CN" | "en-US";
    theme?: "light" | "dark";
};

export function isVoteImageBaseUrl(value: string) {
    try {
        return new URL(value.trim()).origin === VOTE_API_ORIGIN;
    } catch {
        return false;
    }
}

export function isEmbeddedWorkbench() {
    const embedded = new URLSearchParams(window.location.search).get("ui_mode") === "embedded";
    if (embedded) sessionStorage.setItem(EMBEDDED_SESSION_KEY, "1");
    return embedded || sessionStorage.getItem(EMBEDDED_SESSION_KEY) === "1";
}

export function readVoteWorkbenchQueryPreferences(search = window.location.search): VoteWorkbenchQueryPreferences {
    const params = new URLSearchParams(search);
    const theme = params.get("theme")?.trim().toLowerCase();
    const language = params.get("lang")?.trim().toLowerCase();
    return {
        ...(theme === "light" || theme === "dark" ? { theme } : {}),
        ...(language === "zh" || language === "zh-cn" ? { locale: "zh-CN" as const } : language === "en" || language === "en-us" ? { locale: "en-US" as const } : {}),
    };
}

export function configWithoutApiKey(config: AiConfig): AiConfig {
    return {
        ...config,
        apiKey: "",
        channels: config.channels.map((channel) => ({ ...channel, apiKey: "" })),
    };
}
