import { useEffect, useState } from "react";
import { getImageBlob, resolveImageUrl, setImageBlob } from "@/services/image-storage";
import { resizeImageBlob } from "@/lib/image-resize";

let processing = Promise.resolve();
const pending = new Map<string, Promise<string>>();
async function thumbnail(storageKey: string) {
    const key = `${storageKey}:preview`;
    const existing = await resolveImageUrl(key);
    if (existing) return existing;
    const blob = await getImageBlob(storageKey);
    if (!blob) return "";
    const bitmap = await createImageBitmap(blob);
    const scale = Math.min(1, 512 / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    bitmap.close();
    return setImageBlob(key, await resizeImageBlob(blob, width, height, "high", "image/webp"));
}

export function useImageThumbnail(storageKey: string | undefined, source: string) {
    const [url, setUrl] = useState("");
    useEffect(() => {
        let disposed = false;
        setUrl("");
        if (!storageKey) { setUrl(source); return; }
        let work = pending.get(storageKey);
        if (!work) {
            work = processing.then(() => thumbnail(storageKey));
            processing = work.then(() => {}, () => {});
            pending.set(storageKey, work);
            void work.finally(() => pending.delete(storageKey)).catch(() => {});
        }
        void work.then((next) => { if (!disposed) setUrl(next || source); }).catch(() => { if (!disposed) setUrl(source); });
        return () => { disposed = true; };
    }, [storageKey, source]);
    return url;
}
