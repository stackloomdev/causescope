import type { CauseScopeAdapter, SourceLocation } from "../shared.js";

export interface ZustandStoreLike<State> {
  getState(): State;
  subscribe(listener: (state: State, previousState: State) => void): () => void;
}

export interface ZustandAdapterOptions {
  stores: Record<string, ZustandStoreLike<unknown>>;
  sources?: Record<string, SourceLocation>;
}

export function zustandAdapter(options: ZustandAdapterOptions): CauseScopeAdapter;
