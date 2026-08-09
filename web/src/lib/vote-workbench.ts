import type { AiConfig, ModelChannel } from "@/stores/use-config-store";

export const VOTE_WORKBENCH = true;
export const VOTE_API_ORIGIN = "https://image.vote520.com";
export const VOTE_IMAGE_MODEL = "gpt-image-2";
export const VOTE_CHANNEL_ID = "vote-image";
export const VOTE_MODEL_VALUE = `${VOTE_CHANNEL_ID}::${VOTE_IMAGE_MODEL}`;
export const VOTE_DATA_NOTICE_STORAGE_KEY = "infinite-canvas:vote-data-notice:v1";
const EMBEDDED_SESSION_KEY = "vote-canvas:embedded";

export type VoteWorkbenchQueryPreferences = {
    locale?: "zh-CN" | "en-US";
    theme?: "light" | "dark";
};

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

export function normalizeVoteWorkbenchConfig(config: AiConfig): AiConfig {
    const existing = config.channels.find((channel) => channel.id === VOTE_CHANNEL_ID);
    const channel: ModelChannel = {
        id: VOTE_CHANNEL_ID,
        name: "Vote Image",
        baseUrl: VOTE_API_ORIGIN,
        apiKey: existing?.apiKey || "",
        apiFormat: "openai",
        models: [{ name: VOTE_IMAGE_MODEL, capability: "image" }],
    };
    return {
        ...config,
        channelMode: "local",
        baseUrl: VOTE_API_ORIGIN,
        apiKey: channel.apiKey,
        voteImageKeyVerified: Boolean(channel.apiKey && config.voteImageKeyVerified),
        apiFormat: "openai",
        channels: [channel],
        model: VOTE_MODEL_VALUE,
        imageModel: VOTE_MODEL_VALUE,
        videoModel: "",
        textModel: "",
        audioModel: "",
        models: [VOTE_MODEL_VALUE],
        quality: "auto",
        count: "1",
        canvasImageCount: "1",
    };
}

export function configWithoutApiKey(config: AiConfig): AiConfig {
    return {
        ...config,
        apiKey: "",
        voteImageKeyVerified: false,
        channels: config.channels.map((channel) => ({ ...channel, apiKey: "" })),
    };
}
