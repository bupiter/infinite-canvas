import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";

const root = "/app/dist";
const assetOrigin = validatedAssetOrigin(process.env.VOTE_IMAGE_ASSET_ORIGIN);
const assetSources = assetOrigin ? ` ${assetOrigin}` : "";
const contentSecurityPolicy = [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "form-action 'none'",
    "frame-ancestors 'self' https://ai.vote520.com",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    `connect-src 'self' https://image.vote520.com blob: data:${assetSources}`,
    `img-src 'self' blob: data:${assetSources}`,
    `media-src 'self' blob: data:${assetSources}`,
    "font-src 'self' data:",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
].join("; ");
const contentTypes = {
    ".css": "text/css; charset=utf-8",
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
};

createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url || "/", "http://localhost").pathname);
    const candidate = normalize(join(root, pathname));
    const file = candidate.startsWith(root) && existsSync(candidate) && statSync(candidate).isFile() ? candidate : join(root, "index.html");
    response.setHeader("Content-Type", contentTypes[extname(file)] || "application/octet-stream");
    response.setHeader("Content-Security-Policy", contentSecurityPolicy);
    response.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()");
    response.setHeader("Cache-Control", file.includes(`${root}/assets/`) ? "public, max-age=31536000, immutable" : "no-store");
    createReadStream(file).pipe(response);
}).listen(3000, "0.0.0.0");

function validatedAssetOrigin(value) {
    if (!value?.trim()) return "";
    try {
        const url = new URL(value.trim());
        return url.protocol === "https:" ? url.origin : "";
    } catch {
        return "";
    }
}
