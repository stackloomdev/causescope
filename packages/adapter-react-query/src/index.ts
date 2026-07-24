import type { CauseScopeAdapter } from "@causescope/shared";

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

function queryIdentity(queryKey: unknown): string {
  let serialized: string;
  try {
    serialized = JSON.stringify(queryKey) ?? String(queryKey);
  } catch {
    serialized = String(queryKey);
  }
  let hash = 0x811c9dc5;
  for (let index = 0; index < serialized.length; index += 1) {
    hash ^= serialized.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `${(hash >>> 0).toString(36)}-${serialized.length}`;
}

export function reactQueryAdapter(options: ReactQueryAdapterOptions): CauseScopeAdapter {
  return {
    name: "react-query",
    install(api) {
      const queryCache = options.queryClient.getQueryCache();
      const registerQueries = (): void => {
        try {
          for (const query of queryCache.getAll()) {
            api.registerValueOrigin(query.state.data, {
              kind: "react-query",
              confidence: "confirmed",
              label: "React Query",
              path: "data",
              traceId: `react-query:${queryIdentity(query.queryKey)}`,
              metadata: {
                queryKey: query.queryKey,
                status: query.state.status ?? "unknown",
                fetchStatus: query.state.fetchStatus ?? "unknown",
                dataUpdatedAt: query.state.dataUpdatedAt ?? 0,
              },
            }, true);
          }
        } catch {
          // Adapter diagnostics must not break Query Cache notifications.
        }
      };
      registerQueries();
      const unsubscribe = queryCache.subscribe(registerQueries);
      return unsubscribe;
    },
  };
}
