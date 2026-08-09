import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";

const root = "/app/dist";
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
    response.setHeader("Content-Security-Policy", "frame-ancestors 'self' https://ai.vote520.com");
    response.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("Cache-Control", file.includes(`${root}/assets/`) ? "public, max-age=31536000, immutable" : "no-store");
    createReadStream(file).pipe(response);
}).listen(3000, "0.0.0.0");
