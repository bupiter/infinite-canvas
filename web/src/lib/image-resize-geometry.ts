export type ImageResizeFit = "stretch" | "cover" | "contain";

export function resolveImageResizeGeometry(sourceWidth: number, sourceHeight: number, targetWidth: number, targetHeight: number, fit: ImageResizeFit = "stretch") {
    if (fit === "stretch") return { x: 0, y: 0, width: targetWidth, height: targetHeight };
    const scale = fit === "cover" ? Math.max(targetWidth / sourceWidth, targetHeight / sourceHeight) : Math.min(targetWidth / sourceWidth, targetHeight / sourceHeight);
    const width = Math.max(1, Math.round(sourceWidth * scale));
    const height = Math.max(1, Math.round(sourceHeight * scale));
    return { x: Math.round((targetWidth - width) / 2), y: Math.round((targetHeight - height) / 2), width, height };
}
