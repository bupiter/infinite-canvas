import "fake-indexeddb/auto";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { App, ConfigProvider } from "antd";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { webcrypto } from "node:crypto";
import { expect, it, vi } from "vitest";

it("opens the real workbench with the default Vote channel and supported controls", async () => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    vi.stubGlobal("crypto", webcrypto);
    vi.stubGlobal("__APP_VERSION__", "test");
    vi.stubGlobal("__APP_RELEASES__", []);
    window.matchMedia = vi.fn().mockImplementation(() => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} }));
    vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
    vi.stubGlobal("fetch", vi.fn(async () => new Response("[]", { status: 200, headers: { "Content-Type": "application/json" } })));
    const { default: axios } = await import("axios");
    axios.defaults.adapter = async () => { throw new Error("test network disabled"); };
    const { default: ImagePage } = await import("@/pages/image");
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    try {
        await act(() => root.render(React.createElement(MemoryRouter, {}, React.createElement(QueryClientProvider, { client: new QueryClient() }, React.createElement(ConfigProvider, {}, React.createElement(App, {}, React.createElement(ImagePage)))))));
        await vi.waitFor(() => expect(container.textContent).toContain("先生成并保存原图"));
        expect(container.textContent).toContain("gpt-image-2");
        expect(container.textContent).toContain("多张图片会自动排队");
        expect(container.querySelectorAll('input[type="number"]')).toHaveLength(1);
    } finally {
        await act(() => root.unmount());
        container.remove();
    }
});
