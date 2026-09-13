import { useEffect, useMemo, useState } from "react";
import { Button, Input, Modal, Segmented } from "antd";
import { ImagePlus } from "lucide-react";
import { useTranslation } from "react-i18next";

import { readImageMeta } from "@/lib/image-utils";
import { MAX_UPSCALE_LONG_EDGE, resolveUpscaleSize, type ImageUpscaleAlgorithm, type ImageUpscaleParams } from "@/lib/canvas/canvas-image-data";
import type { ImageResizeFit } from "@/lib/image-resize-geometry";

export type CanvasImageUpscaleParams = ImageUpscaleParams;

const algorithms: ImageUpscaleAlgorithm[] = ["high", "bilinear", "nearest"];

const targetOptions = [
    { label: "等比 · 1K", value: "long-1024", targetLongEdge: 1024 },
    { label: "等比 · 2K", value: "long-2048", targetLongEdge: 2048 },
    { label: "等比 · 4K", value: "long-4096", targetLongEdge: MAX_UPSCALE_LONG_EDGE },
    { label: "1:1 · 2048", value: "fixed-2048x2048", width: 2048, height: 2048 },
    { label: "3:2 · 2048", value: "fixed-2048x1365", width: 2048, height: 1365 },
    { label: "2:3 · 2048", value: "fixed-1365x2048", width: 1365, height: 2048 },
    { label: "4:3 · 2048", value: "fixed-2048x1536", width: 2048, height: 1536 },
    { label: "3:4 · 2048", value: "fixed-1536x2048", width: 1536, height: 2048 },
    { label: "16:9 · 2048", value: "fixed-2048x1152", width: 2048, height: 1152 },
    { label: "9:16 · 2048", value: "fixed-1152x2048", width: 1152, height: 2048 },
    { label: "16:9 · 3840", value: "fixed-3840x2160", width: 3840, height: 2160 },
    { label: "9:16 · 3840", value: "fixed-2160x3840", width: 2160, height: 3840 },
    { label: "自定义", value: "custom" },
];

const defaultParams: CanvasImageUpscaleParams = {
    targetLongEdge: 2048,
    algorithm: "high",
    fit: "contain",
};

export function CanvasNodeUpscaleDialog({ dataUrl, open, onClose, onConfirm }: { dataUrl: string; open: boolean; onClose: () => void; onConfirm: (params: CanvasImageUpscaleParams) => void }) {
    const { t } = useTranslation();
    const [params, setParams] = useState<CanvasImageUpscaleParams>(defaultParams);
    const [targetOption, setTargetOption] = useState("long-2048");
    const [customTarget, setCustomTarget] = useState({ width: 2048, height: 2048 });
    const [readError, setReadError] = useState("");
    const [image, setImage] = useState<{ width: number; height: number } | null>(null);
    const sourceLongEdge = image ? Math.max(image.width, image.height) : 0;
    const selectedTarget = targetOptions.find((option) => option.value === targetOption) || targetOptions[1];
    const exactWidth = selectedTarget.width || (targetOption === "custom" ? customTarget.width : undefined);
    const exactHeight = selectedTarget.height || (targetOption === "custom" ? customTarget.height : undefined);
    const targetLongEdge = exactWidth && exactHeight ? Math.max(exactWidth, exactHeight) : selectedTarget.targetLongEdge || params.targetLongEdge;
    const outputSize = useMemo(() => image ? exactWidth && exactHeight ? { width: exactWidth, height: exactHeight } : resolveUpscaleSize(image.width, image.height, targetLongEdge) : null, [exactHeight, exactWidth, image, targetLongEdge]);
    const validTarget = Boolean(outputSize && outputSize.width >= 1 && outputSize.height >= 1 && Math.max(outputSize.width, outputSize.height) <= MAX_UPSCALE_LONG_EDGE && outputSize.width * outputSize.height <= 16_777_216);
    const canUpscale = Boolean(image && validTarget && (outputSize!.width > image.width || outputSize!.height > image.height));
    const reachedMax = Boolean(image && sourceLongEdge >= MAX_UPSCALE_LONG_EDGE);

    useEffect(() => {
        if (!open) return;
        setParams(defaultParams);
        setTargetOption("long-2048");
        setCustomTarget({ width: 2048, height: 2048 });
        setImage(null);
        setReadError("");
    }, [dataUrl, open]);

    useEffect(() => {
        if (!open) return;
        let disposed = false;
        void readImageMeta(dataUrl, { strict: true }).then((meta) => { if (!disposed) setImage(meta); }).catch(() => { if (!disposed) setReadError("原图暂时不可读，请关闭后重试"); });
        return () => { disposed = true; };
    }, [dataUrl, open]);

    useEffect(() => {
        if (!image) return;
        if (!targetOption.startsWith("long-")) return;
        const nextTarget = targetOptions.find((option) => option.targetLongEdge && sourceLongEdge < option.targetLongEdge)?.value || "long-4096";
        setTargetOption(nextTarget);
    }, [image, sourceLongEdge, targetOption]);

    const confirmParams: CanvasImageUpscaleParams = {
        ...params,
        targetLongEdge,
        ...(exactWidth && exactHeight ? { targetWidth: exactWidth, targetHeight: exactHeight, fit: params.fit === "stretch" ? "contain" : params.fit } : { targetWidth: undefined, targetHeight: undefined, fit: "stretch" }),
    };

    return (
        <Modal title={null} open={open && Boolean(dataUrl)} onCancel={onClose} footer={null} width={820} centered destroyOnHidden>
            <div className="space-y-5">
                <div>
                    <h2 className="text-xl font-semibold">放大导出</h2>
                    <p className="mt-2 text-xs opacity-70">等比放大并保留原图。插值放大不保证增加真实细节。</p>
                    {readError && <p role="alert" className="mt-2 text-sm">{readError}</p>}
                </div>
                <div className="grid gap-6 md:grid-cols-[minmax(260px,1fr)_360px]">
                    <div className="rounded-xl border p-4">
                        <div className="grid min-h-[280px] place-items-center rounded-lg bg-black/5">
                            <img src={dataUrl} alt="" className="max-h-[320px] max-w-full rounded-lg object-contain shadow-xl" draggable={false} />
                        </div>
                        <div className="mt-3 flex items-center justify-between text-sm">
                            <span className="opacity-60">{t("canvas.editors.source")}</span>
                            <span className="font-semibold">{image ? `${image.width} x ${image.height} px` : t("canvas.editors.loading")}</span>
                        </div>
                    </div>
                    <div className="space-y-6 py-2">
                        <div className="space-y-2">
                            <div className="font-medium opacity-75">{t("canvas.editors.targetPixels")}</div>
                            <Segmented
                                block
                                value={targetOption}
                                options={targetOptions.map((option) => ({ label: option.label, value: option.value }))}
                                onChange={(value) => setTargetOption(String(value))}
                            />
                            {targetOption === "custom" ? <div className="grid grid-cols-2 gap-2"><Input type="number" min={1} max={MAX_UPSCALE_LONG_EDGE} value={customTarget.width} onChange={(event) => setCustomTarget((current) => ({ ...current, width: Number(event.target.value) || 1 }))} addonBefore="W" /><Input type="number" min={1} max={MAX_UPSCALE_LONG_EDGE} value={customTarget.height} onChange={(event) => setCustomTarget((current) => ({ ...current, height: Number(event.target.value) || 1 }))} addonBefore="H" /></div> : null}
                            {image && !canUpscale ? <div className="text-xs font-medium text-[#ef4444]">{reachedMax ? t("canvas.editors.maxReached") : validTarget ? t("canvas.editors.targetReached") : "尺寸必须在 1 到 4096 像素范围内"}</div> : null}
                        </div>
                        {exactWidth && exactHeight ? <div className="space-y-2"><div className="font-medium opacity-75">输出方式</div><Segmented block value={params.fit} options={[{ label: "裁剪填满", value: "cover" }, { label: "透明留白", value: "contain" }]} onChange={(value) => setParams((current) => ({ ...current, fit: value as ImageResizeFit }))} /></div> : null}
                        <div className="space-y-2">
                            <div className="font-medium opacity-75">{t("canvas.editors.algorithm")}</div>
                            <Segmented
                                block
                                value={params.algorithm}
                                options={algorithms.map((algorithm) => ({
                                    value: algorithm,
                                    label: (
                                        <span className="flex min-h-12 flex-col justify-center text-left leading-5">
                                            <span className="font-medium">{t(`canvas.editors.${algorithm}`)}</span>
                                            <span className="text-xs opacity-55">{t(`canvas.editors.${algorithm}Description`)}</span>
                                        </span>
                                    ),
                                }))}
                                onChange={(value) => setParams((current) => ({ ...current, algorithm: value as ImageUpscaleAlgorithm }))}
                            />
                        </div>
                        <div className="rounded-xl border px-4 py-3 text-sm">
                            <div className="flex items-center justify-between">
                                <span className="opacity-60">{t("canvas.editors.outputSize")}</span>
                                <span className="font-semibold">{outputSize ? `${outputSize.width} x ${outputSize.height} px` : t("canvas.editors.unknown")}</span>
                            </div>
                        </div>
                    </div>
                </div>
                <div className="flex justify-end">
                    <Button type="primary" size="large" icon={<ImagePlus className="size-4" />} disabled={!canUpscale} onClick={() => onConfirm(confirmParams)}>
                        {t("canvas.editors.upscale")}
                    </Button>
                </div>
            </div>
        </Modal>
    );
}
