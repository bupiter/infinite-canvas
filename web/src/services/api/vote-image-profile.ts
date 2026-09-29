import { VOTE_API_ORIGIN, isVoteImageBaseUrl } from "@/lib/vote-workbench";
import { resolveModelRequestConfig, type AiConfig } from "@/stores/use-config-store";

export type ImageParameterMode = "standard" | "fixed";
type Profiles = { version: number; api_origin: string; groups: Record<string, ImageParameterMode> };
let profiles: Promise<Profiles> | undefined;

export async function imageModeForGroup(groupId: number | undefined): Promise<ImageParameterMode | undefined> {
    if (!Number.isSafeInteger(groupId) || !groupId || groupId < 1) return undefined;
    profiles ||= fetch("/vote-image-profiles.json", { cache: "no-store", credentials: "omit" }).then(async response => {
        if (!response.ok) throw new Error("无法读取生图渠道参数配置，请刷新后重试。");
        const data = await response.json() as Profiles;
        if (data.version !== 1 || data.api_origin !== VOTE_API_ORIGIN || !data.groups || Object.values(data.groups).some(mode => mode !== "standard" && mode !== "fixed")) throw new Error("生图渠道参数配置不匹配，请联系站长。");
        return data;
    }).catch(error => { profiles = undefined; throw error; });
    return (await profiles).groups[String(groupId)];
}

export function imageParameterMode(config: AiConfig): ImageParameterMode | undefined {
    const request = resolveModelRequestConfig(config, config.model || config.imageModel);
    return isVoteImageBaseUrl(request.baseUrl) ? request.imageParameterMode : "standard";
}
