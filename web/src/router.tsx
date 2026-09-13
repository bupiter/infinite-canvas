import { lazy, Suspense } from "react";
import { createBrowserRouter, Navigate, Outlet } from "react-router-dom";

import { AnalyticsTracker } from "@/components/layout/analytics-tracker";
import UserLayout from "@/layouts/user-layout";
const AssetsPage = lazy(() => import("@/pages/assets"));
const CanvasPage = lazy(() => import("@/pages/canvas"));
const CanvasProjectPage = lazy(() => import("@/pages/canvas/project"));
const ConfigPage = lazy(() => import("@/pages/config"));
import HomePage from "@/pages/home";
const ImagePage = lazy(() => import("@/pages/image"));
import NotFound from "@/pages/not-found";
const PromptsPage = lazy(() => import("@/pages/prompts"));
const VideoPage = lazy(() => import("@/pages/video"));
import { isEmbeddedWorkbench } from "@/lib/vote-workbench";

function WorkbenchHome() {
    return isEmbeddedWorkbench() ? <Navigate to={`/canvas${window.location.search}`} replace /> : <HomePage />;
}

export const router = createBrowserRouter([
    {
        element: (
            <UserLayout>
                <AnalyticsTracker />
                <Suspense fallback={<div className="p-6 text-sm opacity-60" role="status">正在打开工作台…</div>}><Outlet /></Suspense>
            </UserLayout>
        ),
        children: [
            { path: "/", element: <WorkbenchHome /> },
            { path: "/image", element: <ImagePage /> },
            { path: "/video", element: <VideoPage /> },
            { path: "/assets", element: <AssetsPage /> },
            { path: "/prompts", element: <PromptsPage /> },
            { path: "/canvas", element: <CanvasPage /> },
            { path: "/canvas/:id", element: <CanvasProjectPage /> },
            { path: "/config", element: <ConfigPage /> },
        ],
    },
    { path: "*", element: <NotFound /> },
]);
