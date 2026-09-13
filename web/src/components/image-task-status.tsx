import { useEffect, useState } from "react";
import { imageTaskPhaseLabels, useImageTaskProgress } from "@/stores/use-image-task-progress";

export function ImageTaskStatus({ imageId }: { imageId?: string }) {
    const task = useImageTaskProgress((state) => imageId ? state.tasks[imageId] : undefined);
    const [now, setNow] = useState(Date.now());
    useEffect(() => {
        if (!task || task.phase === "saved" || task.phase === "failed") return;
        const timer = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(timer);
    }, [task?.startedAt, task?.phase]);
    return <span className="text-xs" role="status">{task ? imageTaskPhaseLabels[task.phase] : "等待处理"}{task && !["saved", "failed"].includes(task.phase) ? ` · ${Math.max(0, Math.floor((now - task.startedAt) / 1000))} 秒` : ""}</span>;
}
