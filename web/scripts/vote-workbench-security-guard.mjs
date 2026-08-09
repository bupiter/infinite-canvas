import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const [panel, query, startup, configFile, html, server, imageTasks, imageStorage, imageTools, nginx, nginxHeaders, dockerfile, prebuiltDockerfile, compose, entrypoint] = await Promise.all([
    read("src/components/layout/vote-workbench-config-panel.tsx"),
    read("src/lib/vote-workbench.ts"),
    read("src/main.tsx"),
    read("src/services/config-file.ts"),
    read("index.html"),
    read("local-static-server.mjs"),
    read("src/services/api/sub2api-image-task.ts"),
    read("src/services/image-storage.ts"),
    read("src/components/canvas/canvas-image-toolbar-tools.tsx"),
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

const queryKeys = [...query.matchAll(/params\.get\("([^"]+)"\)/g)].map((match) => match[1]);
assert(queryKeys.includes("theme") && queryKeys.includes("lang"), "theme and lang query preferences must be supported");
assert(
    queryKeys.every((key) => key === "theme" || key === "lang"),
    `unexpected query parameter read: ${queryKeys.join(", ")}`,
);
assert(startup.includes("readVoteWorkbenchQueryPreferences"), "query preferences must be applied during startup");
assert(configFile.includes("configWithoutApiKey(config)"), "configuration export must remove API keys");
assert(html.includes('name="robots" content="noindex, nofollow, noarchive"'), "workbench must remain noindex");
assert(server.includes("frame-ancestors 'self' https://ai.vote520.com"), "frame ancestors must remain restricted to the Sub2API origin");
assert(server.includes("\"default-src 'self'\""), "CSP must default to same-origin resources");
assert(html.includes('src="/theme-bootstrap.js"'), "theme bootstrap must be loaded from a same-origin external script");
assert(!/<script(?![^>]*\bsrc=)[^>]*>[\s\S]*?<\/script>/i.test(html), "HTML must not contain inline scripts");
assert(server.includes("validatedAssetOrigin(process.env.VOTE_IMAGE_ASSET_ORIGIN)"), "object storage must use one validated asset origin");
assert(!server.includes("connect-src https:"), "CSP must not use a broad HTTPS source wildcard");
assert(nginx.match(/include \/etc\/nginx\/snippets\/vote-security-headers\.conf;/g)?.length === 3, "every production Nginx route must include security headers");
assert(nginxHeaders.includes("default-src 'self'"), "production CSP must default to same-origin resources");
assert(nginxHeaders.includes("__VOTE_IMAGE_ASSET_ORIGIN__"), "production CSP must use the validated object storage placeholder");
assert(dockerfile.includes("nginx-security-headers.conf"), "production image must install the CSP header snippet");
assert(prebuiltDockerfile.includes("COPY web/dist /usr/share/nginx/html"), "low-memory production packaging must use the verified prebuilt frontend");
assert(entrypoint.includes("VOTE_IMAGE_ASSET_ORIGIN must be one HTTPS origin without a path"), "production startup must reject unsafe asset origins");
assert(compose.includes("build:\n      context: ."), "production compose must build the Vote fork");
assert(!compose.includes("basketikun/infinite-canvas:latest"), "production compose must never deploy the drifting upstream latest image");
assert(imageTasks.includes("rememberCompletedTaskSources(task.id"), "completed tasks must remain recoverable until their images are persisted");
assert(imageTasks.includes('operation: path === "/images/edits/async" ? "edit" : "generation"'), "pending task records must retain their operation type");
assert(!/payload\.status !== "completed"[\s\S]{0,160}removeTask\(task\.id\)/.test(imageTasks), "completed tasks must not be removed before image persistence");
assert(imageStorage.includes("acknowledgeSub2ApiImageSource(input)"), "successful IndexedDB persistence must acknowledge the completed task");
assert(imageTools.includes('!VOTE_WORKBENCH || tool.id !== "maskEdit"'), "unsupported mask editing must remain hidden in Vote mode");

console.log("Vote workbench security guard passed");
