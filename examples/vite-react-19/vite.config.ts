import { defineConfig } from "vite";
import type { Plugin } from "vite";
import react from "@vitejs/plugin-react";
import causeScope from "causescope/vite";

function fixtureApi(): Plugin {
  return {
    name: "causescope-example-api",
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        if (!request.url) return next();
        const url = new URL(request.url, "http://causescope.local");
        const send = (body: unknown): void => {
          response.statusCode = 200;
          response.setHeader("content-type", "application/json; charset=utf-8");
          response.end(JSON.stringify(body));
        };
        if (url.pathname === "/api/products/42") {
          setTimeout(() => send({
            data: {
              product: { id: "42", name: "Traceable ceramic mug", price: 129, currency: "USD" },
            },
          }), 90);
          return;
        }
        if (url.pathname === "/api/permissions") {
          setTimeout(() => send({ data: { role: "workspace-owner", canPublish: true } }), 70);
          return;
        }
        return next();
      });
    },
  };
}

export default defineConfig({
  plugins: [fixtureApi(), react(), causeScope()],
  server: {
    host: "0.0.0.0",
    allowedHosts: ["terminal.local"],
  },
});
