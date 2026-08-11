import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, isAbsolute, join, normalize, relative } from "node:path";

const root = "/app/dist";
const assetOrigin = validatedAssetOrigin(process.env.VOTE_IMAGE_ASSET_ORIGIN);
const assetSources = assetOrigin ? ` ${assetOrigin}` : "";
const connectSources = validatedOrigins("VOTE_CONNECT_ORIGINS", process.env.VOTE_CONNECT_ORIGINS);
const mediaSources = validatedOrigins("VOTE_MEDIA_ORIGINS", process.env.VOTE_MEDIA_ORIGINS);
const contentSecurityPolicy = [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "form-action 'none'",
    "frame-ancestors 'self' https://ai.vote520.com",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    `connect-src 'self' https://image.vote520.com blob: data:${assetSources}${connectSources}`,
    `img-src 'self' blob: data:${assetSources}${mediaSources}`,
    `media-src 'self' blob: data:${assetSources}${mediaSources}`,
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
    response.setHeader("Content-Security-Policy", contentSecurityPolicy);
    response.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()");

    let pathname;
    try {
        pathname = decodeURIComponent(new URL(request.url || "/", "http://localhost").pathname);
    } catch {
        response.statusCode = 400;
        response.setHeader("Content-Type", "text/plain; charset=utf-8");
        response.setHeader("Cache-Control", "no-store");
        response.end("Bad Request");
        return;
    }
    const candidate = normalize(join(root, pathname));
    const relativePath = relative(root, candidate);
    const isInsideRoot = relativePath && !relativePath.startsWith("..") && !isAbsolute(relativePath);
    const file = isInsideRoot && existsSync(candidate) && statSync(candidate).isFile() ? candidate : join(root, "index.html");
    response.setHeader("Content-Type", contentTypes[extname(file)] || "application/octet-stream");
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

function validatedOrigins(name, value) {
    if (!value?.trim()) return "";
    return value
        .trim()
        .split(/\s+/)
        .map((origin) => {
            const url = new URL(origin);
            if (url.protocol !== "https:" || origin !== url.origin) throw new Error(`${name} must contain only space-separated HTTPS origins without paths`);
            return ` ${url.origin}`;
        })
        .join("");
}
