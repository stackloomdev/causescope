import type { CauseScopeAdapter } from "../shared.js";

interface QueryStateLike {
  data?: unknown;
  status?: string;
  fetchStatus?: string;
  dataUpdatedAt?: number;
}

interface QueryLike {
  queryKey: unknown;
  state: QueryStateLike;
}

interface QueryCacheLike {
  getAll(): QueryLike[];
  subscribe(listener: () => void): () => void;
}

export interface QueryClientLike {
  getQueryCache(): QueryCacheLike;
}

export interface ReactQueryAdapterOptions {
  queryClient: QueryClientLike;
}

export function reactQueryAdapter(options: ReactQueryAdapterOptions): CauseScopeAdapter;
