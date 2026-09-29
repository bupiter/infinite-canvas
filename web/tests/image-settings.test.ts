import { afterEach, expect, it, vi } from "vitest";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import type { AiConfig } from "@/stores/use-config-store";
import { canvasThemes } from "@/lib/canvas-theme";
vi.mock("@/stores/use-config-store", () => ({ resolveModelRequestConfig: (config: AiConfig) => config }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock("@/i18n", () => ({ default: { t: (key: string) => key } }));
import { ImageSettingsPanel } from "@/components/image-settings-panel";
const container = document.createElement("div");
let root: ReturnType<typeof createRoot> | undefined;
afterEach(async () => { if (root) await act(() => root!.unmount()); root = undefined; });
it("hides unsupported parameter controls for a fixed-output channel", async () => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    const update = vi.fn();
    const config = { model: "gpt-image-2", baseUrl: "https://image.vote520.com", quality: "high", size: "3840x2160", count: "10", imageParameterMode: "fixed" } as AiConfig;
    root = createRoot(container);
    await act(() => root!.render(React.createElement(ImageSettingsPanel, { config, onConfigChange: update, theme: canvasThemes.light })));
    expect(container.textContent).toContain("固定输出");
    expect(container.textContent).not.toContain("settingsPanels.image.quality");
    expect(container.textContent).not.toContain("settingsPanels.image.transparent");
    expect(container.textContent).not.toContain("(4k)");
    expect([...container.querySelectorAll("button")].some(button => button.textContent === "9:16")).toBe(false);
    expect(container.querySelectorAll('input[type="number"]')).toHaveLength(1);

});
it("preserves quality and precise dimensions for other providers", async () => {
    const config = { model: "other-image", baseUrl: "https://fixture.invalid", quality: "high", size: "1024x1024", count: "1" } as AiConfig;
    root = createRoot(container);
    await act(() => root!.render(React.createElement(ImageSettingsPanel, { config, onConfigChange: vi.fn(), theme: canvasThemes.light })));
    expect(container.textContent).toContain("settingsPanels.image.quality");
    expect(container.textContent).toContain("settingsPanels.image.transparent");
    expect([...container.querySelectorAll("button")].some((button) => button.textContent === "4k")).toBe(true);
    expect(container.querySelectorAll('input[type="number"]').length).toBeGreaterThanOrEqual(3);
});

it("restores official controls and exact dimensions for the native route", async () => {
    const update = vi.fn();
    const config = { model: "gpt-image-2", baseUrl: "https://image.vote520.com", quality: "high", size: "3840x2160", count: "1", imageParameterMode: "standard" } as AiConfig;
    root = createRoot(container);
    await act(() => root!.render(React.createElement(ImageSettingsPanel, { config, onConfigChange: update, theme: canvasThemes.light })));
    expect(container.textContent).toContain("settingsPanels.image.quality");
    expect(container.textContent).toContain("settingsPanels.image.transparent");
    const portrait = [...container.querySelectorAll("button")].find(button => button.textContent === "9:16")!;
    await act(() => portrait.click());
    expect(update).toHaveBeenCalledWith("size", "2160x3840");
    expect(container.querySelectorAll('input[type="number"]')).toHaveLength(3);
});
