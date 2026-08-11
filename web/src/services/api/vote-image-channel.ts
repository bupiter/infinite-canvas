import axios from "axios";

import i18n from "@/i18n";
import { VOTE_IMAGE_MODEL } from "@/lib/vote-workbench";
import { buildApiUrl, type ModelChannel } from "@/stores/use-config-store";

export async function validateVoteImageChannel(channel: ModelChannel, signal?: AbortSignal) {
    try {
        const response = await axios.get<{ data?: Array<{ id?: string }> }>(buildApiUrl(channel.baseUrl, "/models"), {
            headers: { Authorization: `Bearer ${channel.apiKey}` },
            signal,
        });
        const models = new Set((response.data.data || []).map((model) => model.id?.trim()).filter((model): model is string => Boolean(model)));
        if (models.size !== 1 || !models.has(VOTE_IMAGE_MODEL)) throw new VoteImageGroupError();
    } catch (error) {
        if (error instanceof VoteImageGroupError) throw new Error(i18n.t("voteWorkbench.groupNotImageOnly"));
        if (axios.isCancel(error) || (error instanceof DOMException && error.name === "AbortError")) throw error;
        if (axios.isAxiosError(error) && (error.response?.status === 401 || error.response?.status === 403)) throw new Error(i18n.t("voteWorkbench.authenticationFailed"));
        throw new Error(i18n.t("voteWorkbench.serviceUnavailable"));
    }
}

class VoteImageGroupError extends Error {}
