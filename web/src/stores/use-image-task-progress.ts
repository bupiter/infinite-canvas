import { create } from "zustand";

export type ImageTaskPhase = "queued" | "submitting" | "processing" | "upscaling" | "downloading" | "saving" | "saved" | "recoverable" | "unknown" | "failed";
export type ImageTaskProgress = { taskId: string; phase: ImageTaskPhase; startedAt: number };
export const imageTaskPhaseLabels: Record<ImageTaskPhase, string> = {
    queued: "等待提交", submitting: "正在提交", processing: "生成中", upscaling: "正在放大图片", downloading: "正在获取图片",
    saving: "正在保存到本机", saved: "已保存到本机", recoverable: "结果待获取", unknown: "提交结果待确认", failed: "任务失败",
};
export const useImageTaskProgress = create<{ tasks: Record<string, ImageTaskProgress>; update: (imageId: string, task: ImageTaskProgress) => void }>((set) => ({
    tasks: {},
    update: (imageId, task) => set((state) => ({ tasks: { ...state.tasks, [imageId]: task } })),
}));
