import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { App } from "./App";
import { queryClient } from "./queryClient";
import { preferenceStore } from "./stores/preferences";
import "./styles.css";

const root = document.getElementById("root");
if (!root) throw new Error("Missing #root element");

async function start(container: HTMLElement): Promise<void> {
  if (import.meta.env.DEV) {
    const [{ getCauseScopeRuntime }, { reactQueryAdapter }, { zustandAdapter }] = await Promise.all([
      import("causescope"),
      import("causescope/adapters/react-query"),
      import("causescope/adapters/zustand"),
    ]);
    const runtime = getCauseScopeRuntime();
    runtime.installAdapter(reactQueryAdapter({ queryClient }));
    runtime.installAdapter(zustandAdapter({
      stores: { preferenceStore },
      sources: {
        preferenceStore: { file: "src/stores/preferences.ts", line: 11, column: 38 },
      },
    }));
  }

  createRoot(container).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </StrictMode>,
  );
}

void start(root);
