import { resolveImageResizeGeometry, type ImageResizeFit } from "./image-resize-geometry";

self.onmessage = async ({ data }: MessageEvent<{ blob: Blob; width: number; height: number; algorithm: string; type: string; fit?: ImageResizeFit }>) => {
    let bitmap: ImageBitmap | undefined;
    try {
        bitmap = await createImageBitmap(data.blob);
        const canvas = new OffscreenCanvas(data.width, data.height);
        const context = canvas.getContext("2d");
        if (!context) throw new Error("context");
        context.imageSmoothingEnabled = data.algorithm !== "nearest";
        context.imageSmoothingQuality = data.algorithm === "bilinear" ? "medium" : "high";
        const geometry = resolveImageResizeGeometry(bitmap.width, bitmap.height, data.width, data.height, data.fit);
        if (data.fit === "contain") context.clearRect(0, 0, data.width, data.height);
        context.drawImage(bitmap, geometry.x, geometry.y, geometry.width, geometry.height);
        const blob = await canvas.convertToBlob({ type: data.type, quality: 0.85 });
        self.postMessage({ blob });
    } catch {
        self.postMessage({ error: "图片处理失败，原图仍可使用" });
    } finally { bitmap?.close(); }
};
