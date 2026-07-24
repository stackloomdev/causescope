import type { FilterPattern } from "@rollup/pluginutils";
import type { RedactOptions } from "./shared.js";

export interface CauseScopePlugin {
  name: string;
}

export interface CauseScopeOptions {
  enabled?: boolean;
  include?: FilterPattern;
  exclude?: FilterPattern;
  openInEditor?: boolean;
  editor?: string;
  maxTimelineEvents?: number;
  maxTraceNodes?: number;
  maxNetworkResponseBytes?: number;
  maxNetworkBytes?: number;
  ignoreComponents?: string[];
  traceNetwork?: boolean;
  traceStorage?: boolean;
  redact?: Partial<RedactOptions>;
}

export default function causeScope(options?: CauseScopeOptions): CauseScopePlugin;
