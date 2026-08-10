import type { ReactNode } from "react";
import { useEffect, useRef } from "react";

import { changeAppLocale } from "@/i18n";
import { usePromptSourceScheduler } from "@/hooks/use-prompt-source-scheduler";
import { useThemeStore } from "@/stores/use-theme-store";

export function ClientRootInit({ children }: { children: ReactNode }) {
    const handledConfigParams = useRef(false);
    const setTheme = useThemeStore((state) => state.setTheme);

    usePromptSourceScheduler();

    useEffect(() => {
        if (handledConfigParams.current) return;
        const searchParams = new URLSearchParams(window.location.search);
        handledConfigParams.current = true;
        const theme = searchParams.get("theme");
        const lang = searchParams.get("lang");
        if (theme === "light" || theme === "dark") setTheme(theme);
        if (lang === "zh-CN" || lang === "en-US") void changeAppLocale(lang);

        const forbidden = new Set(["baseurl", "apikey", "token", "user_id", "src_url"]);
        const forbiddenKeys = Array.from(searchParams.keys()).filter((key) => forbidden.has(key.toLowerCase()));
        const hasForbidden = forbiddenKeys.length > 0;
        forbiddenKeys.forEach((key) => searchParams.delete(key));
        if (hasForbidden) window.history.replaceState(null, "", `${window.location.pathname}${searchParams.size ? `?${searchParams}` : ""}${window.location.hash}`);
    }, [setTheme]);

    return <>{children}</>;
}
