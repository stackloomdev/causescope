import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";
import causeScope from "causescope/vite";

/**
 * Serves the order the refund fixture reads, so the lab makes a real request
 * over the network stack instead of holding a fake value in memory. Without a
 * genuine response there is no network evidence to trace, and the chain the
 * README demonstrates — rendered UI back to the response that produced it —
 * would be the one thing the public lab could not show.
 *
 * `?settled=1` answers with the paid order, so the same request can be replayed
 * to watch the chain change while the inspector is open.
 */
function orderEndpoint(): Plugin {
  return {
    name: "causescope-live-lab-order-endpoint",
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const url = new URL(request.url ?? "/", "http://localhost");
        if (url.pathname !== "/api/orders/4821") return next();
        response.setHeader("content-type", "application/json");
        response.end(JSON.stringify({
          data: {
            order: {
              id: "4821",
              customer: "Noah Williams",
              amount: 184,
              status: url.searchParams.get("settled") === "1" ? "paid" : "pending",
            },
          },
        }));
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), causeScope(), orderEndpoint()],
});
