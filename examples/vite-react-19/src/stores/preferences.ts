import { create } from "zustand";

interface PreferenceState {
  compact: boolean;
  density: "comfortable" | "compact";
  toggleCompact: () => void;
}

export const usePreferenceStore = create<PreferenceState>((set) => ({
  compact: false,
  density: "comfortable",
  toggleCompact: () => set((state) => ({
    compact: !state.compact,
    density: state.compact ? "comfortable" : "compact",
  })),
}));

export const preferenceStore = usePreferenceStore;
