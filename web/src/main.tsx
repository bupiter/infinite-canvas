import React from "react";
import { createRoot } from "react-dom/client";
import "antd/dist/reset.css";
import "streamdown/styles.css";
import "./styles/globals.css";
import { RouterProvider } from "react-router-dom";

import { AppProviders } from "@/components/layout/app-providers";
import { changeAppLocale } from "@/i18n";
import { initAnalytics } from "@/lib/analytics";
import { readVoteWorkbenchQueryPreferences } from "@/lib/vote-workbench";
import { router } from "@/router";
import { useThemeStore } from "@/stores/use-theme-store";

const queryPreferences = readVoteWorkbenchQueryPreferences();
if (queryPreferences.locale) void changeAppLocale(queryPreferences.locale);
if (queryPreferences.theme) useThemeStore.getState().setTheme(queryPreferences.theme);

initAnalytics();

document.body.style.fontFamily = '"SF Pro Display","SF Pro Text","PingFang SC","Microsoft YaHei","Helvetica Neue",sans-serif';

createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
        <AppProviders>
            <RouterProvider router={router} />
        </AppProviders>
    </React.StrictMode>,
);
