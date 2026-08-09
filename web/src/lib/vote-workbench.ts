import type { AiConfig, ModelChannel } from "@/stores/use-config-store";

export const VOTE_WORKBENCH = true;
export const VOTE_API_ORIGIN = "https://image.vote520.com";
export const VOTE_IMAGE_MODEL = "gpt-image-2";
export const VOTE_CHANNEL_ID = "vote-image";
export const VOTE_MODEL_VALUE = `${VOTE_CHANNEL_ID}::${VOTE_IMAGE_MODEL}`;
const EMBEDDED_SESSION_KEY = "vote-canvas:embedded";

export function isEmbeddedWorkbench() {
    const embedded = new URLSearchParams(window.location.search).get("ui_mode") === "embedded";
    if (embedded) sessionStorage.setItem(EMBEDDED_SESSION_KEY, "1");
    return embedded || sessionStorage.getItem(EMBEDDED_SESSION_KEY) === "1";
}

export function normalizeVoteWorkbenchConfig(config: AiConfig): AiConfig {
    const existing = config.channels.find((channel) => channel.id === VOTE_CHANNEL_ID) || config.channels[0];
    const channel: ModelChannel = {
        id: VOTE_CHANNEL_ID,
        name: "Vote Image",
        baseUrl: VOTE_API_ORIGIN,
        apiKey: existing?.apiKey || config.apiKey || "",
        apiFormat: "openai",
        models: [{ name: VOTE_IMAGE_MODEL, capability: "image" }],
    };
    return {
        ...config,
        channelMode: "local",
        baseUrl: VOTE_API_ORIGIN,
        apiKey: channel.apiKey,
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
        channels: config.channels.map((channel) => ({ ...channel, apiKey: "" })),
    };
}
