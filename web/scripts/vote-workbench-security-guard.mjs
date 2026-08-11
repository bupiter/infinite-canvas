import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const [channelEditor, voteValidation, imageApi, imageTask, imagePage, localReset, localStoragePanel, configStore, modelPicker, promptPresets, embeddedPromptText, query, startup, clientRoot, configFile, canvasExport, html, server, imageStorage, canvasPage, sidePanel, toolbar, zoomControls, userActions, nginx, nginxHeaders, dockerfile, prebuiltDockerfile, compose, entrypoint] = await Promise.all([
    read("src/components/layout/channel-editor-drawer.tsx"),
    read("src/services/api/vote-image-channel.ts"),
    read("src/services/api/image.ts"),
    read("src/services/api/sub2api-image-task.ts"),
    read("src/pages/image/index.tsx"),
    read("src/services/local-data-reset.ts"),
    read("src/components/layout/config-local-storage.tsx"),
    read("src/stores/use-config-store.ts"),
    read("src/components/model-picker.tsx"),
    read("src/services/api/prompt-source-presets.ts"),
    read("public/prompts/123uq-image.json"),
    read("src/lib/vote-workbench.ts"),
    read("src/main.tsx"),
    read("src/components/layout/client-root-init.tsx"),
    read("src/services/config-file.ts"),
    read("src/lib/canvas/canvas-export.ts"),
    read("index.html"),
    read("local-static-server.mjs"),
    read("src/services/image-storage.ts"),
    read("src/pages/canvas/project.tsx"),
    read("src/components/canvas/canvas-side-panel.tsx"),
    read("src/components/canvas/canvas-toolbar.tsx"),
    read("src/components/canvas/canvas-zoom-controls.tsx"),
    read("src/components/layout/user-status-actions.tsx"),
    read("../nginx.conf"),
    read("../nginx-security-headers.conf"),
    read("../Dockerfile"),
    read("../Dockerfile.prebuilt"),
    read("../docker-compose.yml"),
    read("docker-entrypoint.sh"),
]);

const assert = (condition, message) => {
    if (!condition) throw new Error(message);
};

assert(channelEditor.includes("Input.Password") && channelEditor.includes("visibilityToggle={false}"), "API keys must remain masked with no plaintext visibility toggle");
assert(channelEditor.includes("if (!isVoteImageBaseUrl(normalized.baseUrl))"), "Vote validation must be scoped to the Vote image origin so third-party providers remain native");
assert(channelEditor.includes("firstUseData") && channelEditor.includes("firstUseModeration") && channelEditor.includes("firstUseBilling") && channelEditor.includes("firstUsePolicy"), "first-time Vote use must disclose local data, moderation, billing, and abuse policy");
assert(channelEditor.includes("await validateVoteImageChannel(normalized, controller.signal)"), "Vote providers must validate their key before saving");
assert(/await validateVoteImageChannel\(normalized, controller\.signal\);[\s\S]{0,360}onSave\(/.test(channelEditor), "Vote providers must not save before validation succeeds");
assert(voteValidation.includes('buildApiUrl(channel.baseUrl, "/models")'), "Vote key validation must call the provider models endpoint");
assert(voteValidation.includes("models.size !== 1 || !models.has(VOTE_IMAGE_MODEL)"), "Vote key validation must require exactly the gpt-image-2 model");
assert(voteValidation.includes("signal,"), "Vote validation must remain abortable when credentials change");
assert(imageApi.includes('quality: "low"'), "Vote image generation must use the economical 1K upstream quality");
assert(imageApi.includes("outputSize,") && imageApi.includes("sourceSize: resolveSize"), "Vote image generation must separate source composition size from exact output size");
assert(!imageApi.includes("sourceSize === outputSize ? undefined : outputSize"), "1K Vote output must still be normalized to exact pixels");
assert(imageTask.includes('"X-Sub2api-Image-Output-Size"') && imageTask.includes('"X-Sub2api-Image-Resize-Filter": "lanczos"'), "Vote image tasks must request server-side Lanczos output");
assert(imageTask.includes("enqueueForApiKey") && imageTask.includes("IMAGE_TASK_ALREADY_ACTIVE"), "Vote image tasks must queue instead of failing the next submission");
assert(imageTask.includes('payload.status === "queued" || payload.status === "processing"'), "server-queued Vote tasks must keep polling instead of failing as unknown");
assert(imageTask.includes("sub2api_image_tasks") && imageTask.includes("resumeSub2ApiImageTask"), "accepted Vote tasks must remain recoverable after reload");
assert(imagePage.includes("setResults((current) => [...current, ...slots])"), "new image batches must append visible pending slots without replacing active work");
assert(imagePage.includes('disabled={!canGenerate}'), "the image workbench must allow another submission while generation is active");
assert(!imagePage.includes('disabled={!canGenerate || running}'), "active image generation must not lock the submit button");
assert(localReset.includes('["infinite-canvas", "infinite-canvas-plugins"]'), "local reset must remove primary and plugin IndexedDB data");
assert(localReset.includes("localStorage.clear()") && localReset.includes("sessionStorage.clear()"), "local reset must remove browser credentials and transient Vote state");
assert(localStoragePanel.includes("clearVoteWorkbenchData()") && localStoragePanel.includes("clearAllDescription"), "settings must expose a confirmed one-click local data reset");
assert(!configStore.includes("const fallbackModel = capability"), "missing capability models must not fall back to defaultConfig");
assert(configStore.includes('return selectableModelsByCapability(config, capability)[0] || ""'), "capability resolution must return a configured model or an explicit empty value");
assert(configStore.includes("return findChannelModel(config, value)?.channel || null"), "unknown models must not fall back to the first provider");
assert(/model: channel \? modelOptionName\(value\) : ""[\s\S]{0,180}baseUrl: channel\?\.baseUrl \|\| ""[\s\S]{0,120}apiKey: channel\?\.apiKey \|\| ""/.test(configStore), "unresolved request models must clear model, endpoint, and API key");
assert(configStore.includes('audioModel: normalizeModelForCapability(config.audioModel, channels, "audio")'), "persisted Vote-only settings must not inject the default audio model");
assert(modelPicker.includes('const current = !capability || options.includes(requested) ? requested : ""'), "the model picker must hide stale models with the wrong capability");
assert(modelPicker.includes("options.length ? t(\"settingsPanels.model.select\") : emptyModelLabel(config, capability)"), "the model picker trigger must explain which missing capability to configure");
const embeddedPrompts = JSON.parse(embeddedPromptText);
assert(promptPresets.includes('url: "/prompts/123uq-image.json?v=2026-08-11-2"'), "the Vote prompt collection must load from the same origin");
assert(Array.isArray(embeddedPrompts) && embeddedPrompts.length === 4, "the embedded Vote prompt collection must contain four scene templates");
assert(new Set(embeddedPrompts.map((item) => item.id)).size === embeddedPrompts.length, "embedded prompt ids must be unique");
assert(embeddedPrompts.every((item) => item.coverUrl?.startsWith("/prompts/assets/123uq-image/") && item.coverUrl.endsWith(".webp")), "embedded prompts must use same-origin WebP covers");
assert(embeddedPrompts.every((item) => item.title?.trim() && item.prompt?.trim() && item.description?.includes("两张参考图")), "embedded prompts must be usable and disclose their two-reference requirement");

const queryKeys = [...query.matchAll(/params\.get\("([^"]+)"\)/g)].map((match) => match[1]);
assert(queryKeys.includes("theme") && queryKeys.includes("lang"), "theme and lang query preferences must be supported");
assert(
    queryKeys.every((key) => key === "theme" || key === "lang"),
    `unexpected query parameter read: ${queryKeys.join(", ")}`,
);
assert(startup.includes("readVoteWorkbenchQueryPreferences"), "query preferences must be applied during startup");
assert(clientRoot.includes('new Set(["baseurl", "apikey", "token", "user_id", "src_url"])'), "sensitive configuration must be removed from URL parameters");
assert(configFile.includes("configWithoutApiKey(config)"), "configuration export must remove API keys");
assert(!canvasExport.includes("use-config-store") && !canvasExport.includes("apiKey"), "canvas project exports must never read configuration or API keys");
assert(canvasExport.includes("getImageBlob(storageKey)"), "canvas project exports must package persisted image blobs");
assert(html.includes('name="robots" content="noindex, nofollow, noarchive"'), "workbench must remain noindex");
assert(server.includes("frame-ancestors 'self' https://ai.vote520.com"), "frame ancestors must remain restricted to the Sub2API origin");
assert(server.includes("\"default-src 'self'\""), "CSP must default to same-origin resources");
assert(html.includes('src="/theme-bootstrap.js"'), "theme bootstrap must be loaded from a same-origin external script");
assert(!/<script(?![^>]*\bsrc=)[^>]*>[\s\S]*?<\/script>/i.test(html), "HTML must not contain inline scripts");
assert(server.includes("validatedAssetOrigin(process.env.VOTE_IMAGE_ASSET_ORIGIN)"), "object storage must use one validated asset origin");
assert(!server.includes("connect-src https:"), "CSP must not use a broad HTTPS source wildcard");
assert(server.includes('".webp": "image/webp"'), "the low-memory static server must return the correct MIME type for prompt covers");
assert(nginx.match(/include \/etc\/nginx\/snippets\/vote-security-headers\.conf;/g)?.length === 5, "every production Nginx route must include security headers");
assert(nginxHeaders.includes("default-src 'self'"), "production CSP must default to same-origin resources");
assert(nginxHeaders.includes("__VOTE_IMAGE_ASSET_ORIGIN__"), "production CSP must use the validated object storage placeholder");
assert(nginxHeaders.includes("__VOTE_CONNECT_ORIGINS__") && nginxHeaders.includes("__VOTE_MEDIA_ORIGINS__"), "production CSP must use exact runtime origin allowlists");
assert(dockerfile.includes("nginx-security-headers.conf"), "production image must install the CSP header snippet");
assert(prebuiltDockerfile.includes("COPY web/dist /usr/share/nginx/html"), "low-memory production packaging must use the verified prebuilt frontend");
assert(entrypoint.includes("VOTE_IMAGE_ASSET_ORIGIN must be one HTTPS origin without a path"), "production startup must reject unsafe asset origins");
assert(entrypoint.includes("must contain only space-separated HTTPS origins without paths"), "production startup must reject unsafe runtime allowlist entries");
assert(/build:\r?\n      context: \./.test(compose), "production compose must build the Vote fork");
assert(!compose.includes("basketikun/infinite-canvas:latest"), "production compose must never deploy the drifting upstream latest image");
assert(imageStorage.includes("await store.setItem(storageKey, blob)"), "generated images must be persisted as IndexedDB blobs");
assert(imageStorage.includes("await store.getItem<Blob>(storageKey)"), "persisted images must remain readable without their expired signed URL");
assert(canvasPage.includes('className="relative flex h-full min-h-0 overflow-hidden"'), "canvas layout must anchor the mobile overlay panel");
assert(sidePanel.includes("absolute inset-y-0 left-0") && sidePanel.includes("sm:relative"), "the side panel must overlay rather than squeeze the mobile canvas");
assert(sidePanel.includes("border-r pt-16 sm:pt-0"), "the mobile overlay panel must not overlap the canvas top bar");
assert(toolbar.includes("left-3 right-3") && toolbar.includes("sm:left-[300px]"), "the mobile canvas toolbar must stay inside the viewport");
assert(toolbar.includes("flex min-w-0 justify-center"), "the mobile canvas toolbar root must allow its scroll container to shrink");
assert(toolbar.includes("h-14 w-full min-w-0 max-w-full") && toolbar.includes("sm:w-auto"), "the mobile canvas toolbar must be constrained to the viewport width");
assert(/className="hidden sm:block">[\s\S]{0,320}<ToolbarButton id="tool-clear"/.test(toolbar), "the destructive clear-canvas action must not overflow the mobile toolbar");
assert(/className="absolute inset-y-0 right-0 z-40 hidden w-4[^"]*sm:block"/.test(sidePanel), "the side-panel resize handle must be disabled on mobile");
assert(zoomControls.includes("bottom-20 left-3") && zoomControls.includes("hidden w-24 sm:block"), "mobile zoom controls must not overlap the primary toolbar");
assert(userActions.includes('variant === "canvas" ? "hidden sm:inline-flex"'), "secondary canvas actions must collapse on mobile");
assert(userActions.includes("cn(naturalIconClass, secondaryCanvasActionClass)"), "mobile visibility utilities must override the base inline-flex class");

console.log("Vote workbench security guard passed");
