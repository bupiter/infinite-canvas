import { expect, it, vi } from "vitest";
import { withImageTaskSlot } from "@/services/api/image-task-queue";

it("shares four Web Lock slots across independent tab module instances", async () => {
    const held = new Set<string>();
    Object.defineProperty(navigator, "locks", { configurable: true, value: {
        request: async (name: string, _options: unknown, callback: (lock: object | null) => Promise<unknown>) => {
            if (held.has(name)) return callback(null);
            held.add(name);
            try { return await callback({ name }); } finally { held.delete(name); }
        },
    } });
    vi.resetModules();
    const otherTab = await import("@/services/api/image-task-queue");
    const release: Array<() => void> = [];
    let active = 0, peak = 0;
    const work = () => new Promise<number>((resolve) => { active++; peak = Math.max(peak, active); release.push(() => { active--; resolve(1); }); });
    const jobs = Array.from({ length: 8 }, (_, i) => (i % 2 ? otherTab.withImageTaskSlot : withImageTaskSlot)("same-key", work));
    await vi.waitFor(() => expect(release).toHaveLength(4));
    release.splice(0).forEach((done) => done());
    await vi.waitFor(() => expect(release).toHaveLength(4));
    release.splice(0).forEach((done) => done());
    await Promise.all(jobs);
    expect(peak).toBe(4);
    expect(held.size).toBe(0);
});
