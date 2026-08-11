import { create } from "zustand";
import { persist } from "zustand/middleware";

import { DEFAULT_PROMPT_SOURCES, createPromptSource, type PromptSource } from "@/services/api/prompt-source-presets";

export type PromptSourceSchedule = {
    intervalMinutes: number;
    lastFetchedAt: string;
};

const PROMPT_SOURCE_STORE_KEY = "infinite-canvas:prompt_source_store_v2";

const defaultSchedule: PromptSourceSchedule = {
    intervalMinutes: 30,
    lastFetchedAt: "",
};

export const PROMPT_SOURCE_INTERVALS = [0, 30, 60, 360, 1440];

type PromptSourceStore = {
    sources: PromptSource[];
    schedule: PromptSourceSchedule;
    addSource: () => PromptSource;
    saveSource: (source: PromptSource) => void;
    removeSource: (id: string) => void;
    toggleSource: (id: string, enabled: boolean) => void;
    updateSchedule: <K extends keyof PromptSourceSchedule>(key: K, value: PromptSourceSchedule[K]) => void;
};

export const usePromptSourceStore = create<PromptSourceStore>()(
    persist(
        (set) => ({
            sources: DEFAULT_PROMPT_SOURCES,
            schedule: defaultSchedule,
            addSource: () => createPromptSource(),
            saveSource: (source) =>
                set((state) => ({
                    sources: state.sources.some((item) => item.id === source.id)
                        ? state.sources.map((item) => (item.id === source.id && !item.builtIn ? createPromptSource(source) : item))
                        : [...state.sources, createPromptSource(source)],
                })),
            removeSource: (id) => set((state) => ({ sources: state.sources.filter((item) => item.id !== id || item.builtIn) })),
            toggleSource: (id, enabled) => set((state) => ({ sources: state.sources.map((item) => (item.id === id ? { ...item, enabled } : item)) })),
            updateSchedule: (key, value) => set((state) => ({ schedule: { ...state.schedule, [key]: value } })),
        }),
        {
            name: PROMPT_SOURCE_STORE_KEY,
            partialize: (state) => ({ sources: state.sources, schedule: state.schedule }),
            merge: (persisted, current) => {
                const persistedState = (persisted || {}) as Partial<PromptSourceStore>;
                return { ...current, ...normalizePromptSourceState(persistedState.sources, persistedState.schedule) };
            },
        },
    ),
);

export function normalizePromptSourceState(sourcesInput: unknown, scheduleInput: unknown): Pick<PromptSourceStore, "sources" | "schedule"> {
    const savedSources = Array.isArray(sourcesInput) ? sourcesInput.filter((source): source is PromptSource => Boolean(source && typeof source === "object")) : [];
    const enabledById = new Map(savedSources.map((source) => [source.id, source.enabled]));
    const builtInIds = new Set(DEFAULT_PROMPT_SOURCES.map((source) => source.id));
    const builtIn = DEFAULT_PROMPT_SOURCES.map((source) => ({ ...source, enabled: enabledById.get(source.id) ?? source.enabled }));
    const custom = savedSources.filter((source) => !source.builtIn && !builtInIds.has(source.id)).map((source) => createPromptSource(source));
    const schedule = scheduleInput && typeof scheduleInput === "object" && !Array.isArray(scheduleInput) ? (scheduleInput as Partial<PromptSourceSchedule>) : {};
    return { sources: [...builtIn, ...custom], schedule: { ...defaultSchedule, ...schedule } };
}
