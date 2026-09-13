export async function resizeImageBlob(blob: Blob, width: number, height: number, algorithm = "high", type = "image/png"): Promise<Blob> {
    if (typeof OffscreenCanvas !== "undefined" && typeof Worker !== "undefined") {
        return new Promise((resolve, reject) => {
            const worker = new Worker(new URL("./image-resize.worker.ts", import.meta.url), { type: "module" });
            const finish = () => { clearTimeout(timer); worker.terminate(); };
            const timer = setTimeout(() => { finish(); reject(new Error("图片处理超时，原图仍可使用")); }, 120000);
            worker.onmessage = ({ data }) => { finish(); data.blob ? resolve(data.blob) : reject(new Error("图片处理失败，原图仍可使用")); };
            worker.onerror = () => { finish(); reject(new Error("图片处理失败，原图仍可使用")); };
            worker.postMessage({ blob, width, height, algorithm, type });
        });
    }
    const bitmap = await createImageBitmap(blob);
    try {
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext("2d");
        if (!context) throw new Error("浏览器无法处理图片");
        context.imageSmoothingEnabled = algorithm !== "nearest";
        context.imageSmoothingQuality = algorithm === "bilinear" ? "medium" : "high";
        context.drawImage(bitmap, 0, 0, width, height);
        return await new Promise<Blob>((resolve, reject) => canvas.toBlob((result) => result ? resolve(result) : reject(new Error("图片编码失败")), type, 0.85));
    } finally { bitmap.close(); }
}
