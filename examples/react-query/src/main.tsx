import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "../../shared/example.css";
import { queryClient } from "./queryClient";

if (import.meta.env.DEV) {
  const [{ getCauseScopeRuntime }, { reactQueryAdapter }] = await Promise.all([
    import("causescope"),
    import("causescope/adapters/react-query"),
  ]);
  getCauseScopeRuntime().installAdapter(reactQueryAdapter({ queryClient }));
}

function QueryExample(): React.ReactElement {
  const product = useQuery({
    queryKey: ["product", "ceramic-mug"],
    queryFn: async () => ({ name: "Traceable ceramic mug", inventory: 24 }),
  });

  return (
    <main className="example-shell">
      <p className="example-kicker">React Query adapter</p>
      <h1>Follow cached data back to its query.</h1>
      <p className="example-lede">The rendered product retains its query key, status, fetch status, and update time.</p>
      <section className="example-card">
        <h2>{product.data?.name ?? "Loading product…"}</h2>
        <p>Inventory from the configured Query Cache.</p>
        <span className="example-value">inventory = {product.data?.inventory ?? "pending"}</span>
      </section>
    </main>
  );
}

const root = document.getElementById("root");
if (!root) throw new Error("Missing #root element");
createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <QueryExample />
    </QueryClientProvider>
  </StrictMode>,
);
