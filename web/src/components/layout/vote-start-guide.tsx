import { Button } from "antd";
import { useState } from "react";
import { useConfigStore } from "@/stores/use-config-store";

export function VoteStartGuide() {
    const config = useConfigStore(s => s.config);
    const open = useConfigStore(s => s.isConfigOpen);
    const openConfig = useConfigStore(s => s.openConfigDialog);
    const [dismissed, setDismissed] = useState(() => sessionStorage.getItem("vote-start-guide-dismissed") === "1");
    if (dismissed || open || config.channels.some(c => c.apiKey.trim() && c.models.length)) return null;
    return <aside aria-label="新手使用引导" className="fixed bottom-4 left-4 right-4 z-50 space-y-3 rounded-xl border border-stone-200 bg-white p-4 shadow-lg dark:border-stone-700 dark:bg-stone-900 sm:left-auto sm:max-w-sm">
        <div className="font-semibold">先连接生图渠道，就可以开始创作</div>
        <p className="text-sm text-stone-500">选择“Vote 生图”和自己的密钥，地址与模型会自动配置。连接检查不会生成图片或扣费。</p>
        <div className="flex gap-2"><Button type="primary" onClick={() => openConfig(false, "channels")}>开始配置</Button><Button onClick={() => { sessionStorage.setItem("vote-start-guide-dismissed", "1"); setDismissed(true); }}>稍后</Button></div>
        <p className="text-xs text-stone-500">随时可以从设置里的“渠道”重新打开使用帮助。</p>
    </aside>;
}
