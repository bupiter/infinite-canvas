import localforage from "localforage";

import { nanoid } from "nanoid";
import i18n from "@/i18n";
import { readImageMeta } from "@/lib/image-utils";
import { acknowledgeSub2ApiImageSource } from "@/services/api/sub2api-image-task";

export type UploadedImage = {
    url: string;
    storageKey: string;
    width: number;
    height: number;
    bytes: number;
    mimeType: string;
};

const store = localforage.createInstance({ name: "infinite-canvas", storeName: "image_files" });
const imageLogStore = localforage.createInstance({ name: "infinite-canvas", storeName: "image_generation_logs" });
const videoLogStore = localforage.createInstance({ name: "infinite-canvas", storeName: "video_generation_logs" });
const objectUrls = new Map<string, string>();

const GENERATED_IMAGE_DOWNLOAD_TIMEOUT_MS = 30000;
const GENERATED_IMAGE_DOWNLOAD_RETRIES = 3;

export async function uploadImage(input: string | Blob): Promise<UploadedImage> {
    const blob = typeof input === "string" ? await downloadGeneratedImage(input) : input;
    await assertDecodableImage(blob);
    const storageKey = `image:${nanoid()}`;
    await store.setItem(storageKey, blob);
    const url = URL.createObjectURL(blob);
    objectUrls.set(storageKey, url);
    const meta = await readImageMeta(url);
    if (typeof input === "string") await acknowledgeSub2ApiImageSource(input);
    return { url, storageKey, width: meta.width, height: meta.height, bytes: blob.size, mimeType: blob.type || meta.mimeType };
}

async function downloadGeneratedImage(url: string) {
    let lastError: unknown;
    for (let attempt = 0; attempt <= GENERATED_IMAGE_DOWNLOAD_RETRIES; attempt += 1) {
        const controller = new AbortController();
        const timeout = window.setTimeout(() => controller.abort(), GENERATED_IMAGE_DOWNLOAD_TIMEOUT_MS);
        try {
            const response = await fetch(url, { signal: controller.signal, cache: "no-store" });
            if (!response.ok) {
                const error = new Error(`图片下载失败（HTTP ${response.status}）`);
                if (![408, 425, 429, 500, 502, 503, 504].includes(response.status)) {
                    lastError = error;
                    break;
                }
                if (attempt >= GENERATED_IMAGE_DOWNLOAD_RETRIES) throw error;
                lastError = error;
            } else {
                const blob = await response.blob();
                if (!blob.size) throw new Error("图片下载失败：响应为空");
                const contentType = response.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() || blob.type.toLowerCase();
                if (contentType && !contentType.startsWith("image/")) {
                    throw new Error(`图片下载失败：响应类型为 ${contentType}`);
                }
                return blob;
            }
        } catch (error) {
            lastError = error instanceof DOMException && error.name === "AbortError" ? new Error("图片下载超时，请稍后重试") : error;
            if (attempt >= GENERATED_IMAGE_DOWNLOAD_RETRIES) throw lastError;
        } finally {
            window.clearTimeout(timeout);
        }
        await new Promise<void>((resolve) => window.setTimeout(resolve, Math.min(4000, 500 * 2 ** attempt)));
    }
    throw lastError instanceof Error ? lastError : new Error("图片下载失败，请稍后重试");
}

async function assertDecodableImage(blob: Blob) {
    if (!blob.size) throw new Error("图片内容为空，无法显示");
    const url = URL.createObjectURL(blob);
    try {
        if (typeof createImageBitmap === "function") {
            const bitmap = await createImageBitmap(blob);
            bitmap.close();
            return;
        }
        await new Promise<void>((resolve, reject) => {
            const image = new Image();
            image.onload = () => resolve();
            image.onerror = () => reject(new Error("图片内容无法解码，请稍后重试"));
            image.src = url;
        });
    } finally {
        URL.revokeObjectURL(url);
    }
}

export async function resolveImageUrl(storageKey?: string, fallback = "") {
    if (!storageKey) return fallback;
    const cached = objectUrls.get(storageKey);
    if (cached) return cached;
    const blob = await store.getItem<Blob>(storageKey);
    if (!blob) return fallback;
    const url = URL.createObjectURL(blob);
    objectUrls.set(storageKey, url);
    return url;
}

export async function getImageBlob(storageKey: string) {
    return store.getItem<Blob>(storageKey);
}

export async function setImageBlob(storageKey: string, blob: Blob) {
    await store.setItem(storageKey, blob);
    const url = URL.createObjectURL(blob);
    objectUrls.set(storageKey, url);
    return url;
}

export async function imageToDataUrl(image: { url?: string; dataUrl?: string; storageKey?: string }) {
    const url = image.dataUrl || (await resolveImageUrl(image.storageKey, image.url || ""));
    if (!url || url.startsWith("data:")) return url;
    return blobToDataUrl(await (await fetch(url)).blob());
}

export async function deleteStoredImages(keys: Iterable<string>) {
    await Promise.all(
        Array.from(new Set(keys)).map(async (key) => {
            const url = objectUrls.get(key);
            if (url) URL.revokeObjectURL(url);
            objectUrls.delete(key);
            await store.removeItem(key);
        }),
    );
}

export async function cleanupUnusedImages(usedData: unknown) {
    const usedKeys = collectImageStorageKeys(usedData);
    await Promise.all([
        imageLogStore.iterate((value) => {
            collectImageStorageKeys(value, usedKeys);
        }),
        videoLogStore.iterate((value) => {
            collectImageStorageKeys(value, usedKeys);
        }),
    ]);
    const unused: string[] = [];
    await store.iterate((_value, key) => {
        if (!usedKeys.has(key)) unused.push(key);
    });
    await deleteStoredImages(unused);
}

export function collectImageStorageKeys(value: unknown, keys = new Set<string>()) {
    if (!value || typeof value !== "object") return keys;
    if ("storageKey" in value && typeof value.storageKey === "string" && value.storageKey.startsWith("image:")) keys.add(value.storageKey);
    Object.values(value).forEach((item) => (Array.isArray(item) ? item.forEach((child) => collectImageStorageKeys(child, keys)) : collectImageStorageKeys(item, keys)));
    return keys;
}

function blobToDataUrl(blob: Blob) {
    return new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(new Error(i18n.t("common.imageReadFailed")));
        reader.readAsDataURL(blob);
    });
}
