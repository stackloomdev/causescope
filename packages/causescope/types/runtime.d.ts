import type {
  CauseScopeRuntime,
  CauseScopeRuntimeOptions,
  ReactRuntimeAdapter,
} from "./shared.js";

export interface ReactRuntimeAdapterOptions {
  ignoreComponents?: string[];
}

export function getCauseScopeRuntime(options?: CauseScopeRuntimeOptions): CauseScopeRuntime;
export function createReactRuntimeAdapter(options?: ReactRuntimeAdapterOptions): ReactRuntimeAdapter;
export function mountCauseScopeOverlay(runtime: CauseScopeRuntime): HTMLElement | null;
