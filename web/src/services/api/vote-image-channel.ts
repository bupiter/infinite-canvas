import axios from "axios";

import i18n from "@/i18n";
import { VOTE_IMAGE_MODEL, VOTE_IMAGE_MODELS } from "@/lib/vote-workbench";
import { buildApiUrl, guessCapability, type ModelChannel } from "@/stores/use-config-store";

export async function validateVoteImageChannel(channel: ModelChannel, signal?: AbortSignal): Promise<string[]> {
    try {
        const response = await axios.get<{ data?: Array<{ id?: string }> }>(buildApiUrl(channel.baseUrl, "/models"), {
            headers: { Authorization: `Bearer ${channel.apiKey}` },
            signal,
        });
        const models = new Set((response.data.data || []).map((model) => model.id?.trim()).filter((model): model is string => Boolean(model)));
        const supported = VOTE_IMAGE_MODELS.filter((model) => models.has(model));
        if (!supported.length || [...models].some((model) => !model.startsWith("gpt-image-"))) throw new VoteImageGroupError();
        return supported;
    } catch (error) {
        if (error instanceof VoteImageGroupError) throw new Error(i18n.t("voteWorkbench.groupNotImageOnly"));
        if (axios.isCancel(error) || (error instanceof DOMException && error.name === "AbortError")) throw error;
        if (axios.isAxiosError(error) && (error.response?.status === 401 || error.response?.status === 403)) throw new Error(i18n.t("voteWorkbench.authenticationFailed"));
        throw new Error(i18n.t("voteWorkbench.serviceUnavailable"));
    }
}

class VoteImageGroupError extends Error {}

export async function validateVoteTextChannel(channel: ModelChannel, signal?: AbortSignal): Promise<string[]> {
    try {
        const response = await axios.get<{ data?: { id?: string }[] }>(buildApiUrl(channel.baseUrl, "/models"), { headers: { Authorization: `Bearer ${channel.apiKey}` }, signal });
        const names = (response.data.data || []).map(model => model.id || "").filter(name => name && guessCapability(name) === "text");
        if (!names.length) throw new VoteImageGroupError();
        return [...new Set(names)];
    } catch (error) {
        if (error instanceof VoteImageGroupError) throw new Error("这个密钥没有可用的文本模型，请选择其他密钥或检查分组。");
        if (axios.isCancel(error) || signal?.aborted) throw error;
        throw new Error("无法读取文本模型，请检查密钥、分组权限及网络。");
    }
}
