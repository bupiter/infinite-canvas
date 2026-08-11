import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const [panel, query, startup, configFile, canvasExport, html, server, imageTasks, imageStorage, imageTools, canvasPage, sidePanel, toolbar, zoomControls, userActions, nginx, nginxHeaders, dockerfile, prebuiltDockerfile, compose, entrypoint] = await Promise.all([
    read("src/components/layout/vote-workbench-config-panel.tsx"),
    read("src/lib/vote-workbench.ts"),
    read("src/main.tsx"),
    read("src/services/config-file.ts"),
    read("src/lib/canvas/canvas-export.ts"),
    read("index.html"),
    read("local-static-server.mjs"),
    read("src/services/api/sub2api-image-task.ts"),
    read("src/services/image-storage.ts"),
    read("src/components/canvas/canvas-image-toolbar-tools.tsx"),
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

assert(panel.includes("visibilityToggle={false}"), "API Key must never have a plaintext visibility toggle");
assert(panel.includes("firstUsePolicy"), "first-use confirmation must include the abuse policy notice");
assert(panel.includes("validationControllerRef.current?.abort()"), "changing or closing the Key form must cancel stale connection validation");
assert(panel.includes('onChange={(event) => updateDraftApiKey(event.target.value)}'), "editing the Key must use the validation-cancelling update path");
assert(
    /if \(validationControllerRef\.current !== controller\) return;[\s\S]{0,240}setApiKey\(draftApiKey\.trim\(\), true\)/.test(panel),
    "stale connection validation must not save an old API Key",
);
assert(imageTasks.includes("signal,"), "connection validation must pass AbortSignal to the gateway request");
assert(imageTasks.includes("models.size === 1 && models.has(VOTE_IMAGE_MODEL)"), "connection validation must reject mixed or non-image groups");

const queryKeys = [...query.matchAll(/params\.get\("([^"]+)"\)/g)].map((match) => match[1]);
assert(queryKeys.includes("theme") && queryKeys.includes("lang"), "theme and lang query preferences must be supported");
assert(
    queryKeys.every((key) => key === "theme" || key === "lang"),
    `unexpected query parameter read: ${queryKeys.join(", ")}`,
);
assert(startup.includes("readVoteWorkbenchQueryPreferences"), "query preferences must be applied during startup");
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
assert(nginx.match(/include \/etc\/nginx\/snippets\/vote-security-headers\.conf;/g)?.length === 5, "every production Nginx route must include security headers");
assert(nginxHeaders.includes("default-src 'self'"), "production CSP must default to same-origin resources");
assert(nginxHeaders.includes("__VOTE_IMAGE_ASSET_ORIGIN__"), "production CSP must use the validated object storage placeholder");
assert(dockerfile.includes("nginx-security-headers.conf"), "production image must install the CSP header snippet");
assert(prebuiltDockerfile.includes("COPY web/dist /usr/share/nginx/html"), "low-memory production packaging must use the verified prebuilt frontend");
assert(entrypoint.includes("VOTE_IMAGE_ASSET_ORIGIN must be one HTTPS origin without a path"), "production startup must reject unsafe asset origins");
assert(/build:\r?\n      context: \./.test(compose), "production compose must build the Vote fork");
assert(!compose.includes("basketikun/infinite-canvas:latest"), "production compose must never deploy the drifting upstream latest image");
assert(imageTasks.includes("rememberCompletedTaskSources(task.id"), "completed tasks must remain recoverable until their images are persisted");
assert(imageTasks.includes('operation: path === "/images/edits/async" ? "edit" : "generation"'), "pending task records must retain their operation type");
assert(!/payload\.status !== "completed"[\s\S]{0,160}removeTask\(task\.id\)/.test(imageTasks), "completed tasks must not be removed before image persistence");
assert(imageStorage.includes("acknowledgeSub2ApiImageSource(input)"), "successful IndexedDB persistence must acknowledge the completed task");
assert(imageStorage.includes("await store.setItem(storageKey, blob)"), "generated images must be persisted as IndexedDB blobs before remote task acknowledgement");
assert(imageStorage.includes("await store.getItem<Blob>(storageKey)"), "persisted images must remain readable without their expired signed URL");
assert(imageTools.includes('!VOTE_WORKBENCH || tool.id !== "maskEdit"'), "unsupported mask editing must remain hidden in Vote mode");
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
