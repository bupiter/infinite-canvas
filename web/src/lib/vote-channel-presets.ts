import { VOTE_API_ORIGIN } from "@/lib/vote-workbench";
export type ChannelPreset = "image" | "text" | "custom";
export const VOTE_TEXT_ORIGIN = import.meta.env.VITE_VOTE_TEXT_API_ORIGIN || "https://ai.vote520.com";
const textUrl = new URL(VOTE_TEXT_ORIGIN);
if (textUrl.protocol !== "https:" || textUrl.origin !== VOTE_TEXT_ORIGIN) throw new Error("VITE_VOTE_TEXT_API_ORIGIN must be one HTTPS origin without a path");
export const channelPresets = {
    image: { name: "Vote 生图", baseUrl: `${VOTE_API_ORIGIN}/v1` },
    text: { name: "Vote 文本", baseUrl: `${VOTE_TEXT_ORIGIN}/v1` },
};
export function channelPresetFor(baseUrl: string): ChannelPreset {
    try {
        const url = new URL(baseUrl);
        if (url.username || url.password || url.search || url.hash || !["/", "/v1", "/v1/"].includes(url.pathname)) return "custom";
        if (url.origin === VOTE_API_ORIGIN) return "image";
        if (url.origin === VOTE_TEXT_ORIGIN) return "text";
    } catch { /* custom input may be incomplete */ }
    return "custom";
}
