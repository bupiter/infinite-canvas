// Web Locks share the four admission slots across tabs on this origin.
// The server remains authoritative when the key is used on other devices.
export const IMAGE_TASK_CONCURRENCY = 4;
const active = new Map<string, number>();

export function taskDelay(ms: number, signal?: AbortSignal) {
    return new Promise<void>((resolve, reject) => {
        const abort = () => { clearTimeout(timer); reject(new DOMException("Aborted", "AbortError")); };
        const timer = setTimeout(() => { signal?.removeEventListener("abort", abort); resolve(); }, ms);
        if (signal?.aborted) abort();
        else signal?.addEventListener("abort", abort, { once: true });
    });
}

export async function withImageTaskSlot<T>(key: string, work: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    for (;;) {
        signal?.throwIfAborted();
        if (navigator.locks) {
            for (let slot = 0; slot < IMAGE_TASK_CONCURRENCY; slot++) {
                const result = await navigator.locks.request(`vote-image-slot:${key}:${slot}`, { ifAvailable: true }, async (lock) => lock ? { value: await work() } : null);
                if (result) return result.value;
            }
        } else if ((active.get(key) || 0) < IMAGE_TASK_CONCURRENCY) {
            active.set(key, (active.get(key) || 0) + 1);
            try { return await work(); }
            finally { active.set(key, (active.get(key) || 1) - 1); }
        }
        await taskDelay(250, signal);
    }
}
