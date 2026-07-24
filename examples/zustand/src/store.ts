import { create } from "zustand";

interface WorkspaceState {
  compact: boolean;
  density: "comfortable" | "compact";
  toggleDensity(): void;
}

export const useWorkspaceStore = create<WorkspaceState>((set) => ({
  compact: false,
  density: "comfortable",
  toggleDensity: () => set((state) => ({
    compact: !state.compact,
    density: state.compact ? "comfortable" : "compact",
  })),
}));
