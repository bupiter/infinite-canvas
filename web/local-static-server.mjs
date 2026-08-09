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
    if (file.endsWith("config.js")) response.setHeader("Cache-Control", "no-store");
    createReadStream(file).pipe(response);
}).listen(3000, "0.0.0.0");
