import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";

vi.mock("@/lib/image-utils", () => ({ readImageMeta: async () => ({ width: 941, height: 1672, mimeType: "image/png" }) }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
import { CanvasNodeUpscaleDialog } from "@/components/canvas/canvas-node-upscale-dialog";

const container = document.createElement("div");
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: ReturnType<typeof createRoot> | undefined;
afterEach(async () => { if (root) await act(() => root!.unmount()); root = undefined; container.replaceChildren(); document.querySelectorAll(".ant-modal-root").forEach((node) => node.remove()); });

it("updates the target immediately when a fixed 16:9 size is clicked", async () => {
    const onConfirm = vi.fn();
    root = createRoot(container);
    await act(() => root!.render(React.createElement(CanvasNodeUpscaleDialog, { dataUrl: "data:image/png;base64,fixture", open: true, onClose: vi.fn(), onConfirm })));
    await act(async () => { await Promise.resolve(); });
    const target = [...document.body.querySelectorAll("button")].find((button) => button.textContent === "16:9 · 2048") as HTMLButtonElement;
    expect(target).toBeTruthy();
    await act(() => target.click());
    expect(target.getAttribute("aria-pressed")).toBe("true");
    expect(document.body.textContent).toContain("2048 x 1152 px");
});

it("accepts custom dimensions and sends crop/letterbox mode with the exact target", async () => {
    const onConfirm = vi.fn();
    root = createRoot(container);
    await act(() => root!.render(React.createElement(CanvasNodeUpscaleDialog, { dataUrl: "data:image/png;base64,fixture", open: true, onClose: vi.fn(), onConfirm })));
    await act(async () => { await Promise.resolve(); });
    const custom = [...document.body.querySelectorAll("button")].find((button) => button.textContent === "自定义宽高") as HTMLButtonElement;
    await act(() => custom.click());
    const inputs = [...document.body.querySelectorAll("input")].filter((input) => input.type === "number") as HTMLInputElement[];
    await act(() => {
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
        setter.call(inputs[0], "3000"); inputs[0].dispatchEvent(new Event("input", { bubbles: true }));
        setter.call(inputs[1], "2000"); inputs[1].dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => { await Promise.resolve(); });
    expect(document.body.textContent).toContain("3000 x 2000 px");
    const cover = [...document.body.querySelectorAll("button")].find((button) => button.textContent?.includes("裁剪填满")) as HTMLButtonElement;
    await act(() => cover.click());
    const exportButton = [...document.body.querySelectorAll("button")].find((button) => button.textContent === "导出放大图") as HTMLButtonElement;
    await act(() => exportButton.click());
    expect(onConfirm).toHaveBeenCalledWith(expect.objectContaining({ targetWidth: 3000, targetHeight: 2000, fit: "cover" }));
});
