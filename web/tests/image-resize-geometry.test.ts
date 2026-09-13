import { expect, it } from "vitest";
import { resolveImageResizeGeometry } from "@/lib/image-resize-geometry";

it("uses a centered crop when exact output should be filled", () => {
    expect(resolveImageResizeGeometry(1600, 900, 1000, 1000, "cover")).toEqual({ x: -389, y: 0, width: 1778, height: 1000 });
});

it("uses transparent letterboxing when exact output must keep every pixel", () => {
    expect(resolveImageResizeGeometry(1600, 900, 1000, 1000, "contain")).toEqual({ x: 0, y: 219, width: 1000, height: 563 });
});
