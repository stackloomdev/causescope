import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import type { Plugin } from "vite";
import react from "@vitejs/plugin-react";
import causeScope from "causescope/vite";

type HmrFixtureMode = "baseline" | "updated";

const hmrFixturePath = fileURLToPath(new URL("./src/components/HmrStatus.tsx", import.meta.url));
const hmrLabels: Record<HmrFixtureMode, string> = {
  baseline: "HMR baseline",
  updated: "HMR updated",
};

function setHmrFixture(mode: HmrFixtureMode): string {
  const source = readFileSync(hmrFixturePath, "utf8");
  const label = hmrLabels[mode];
  const nextSource = source.replace(
    /const hmrLabel = "(?:HMR baseline|HMR updated)";/,
    `const hmrLabel = "${label}";`,
  );
  if (nextSource === source) {
    if (source.includes(`const hmrLabel = "${label}";`)) return label;
    throw new Error("HMR fixture label marker is missing");
  }
  writeFileSync(hmrFixturePath, nextSource);
  return label;
}

function fixtureApi(enableHmrFixture: boolean): Plugin {
  return {
    name: "causescope-example-api",
    configureServer(server) {
      if (enableHmrFixture) setHmrFixture("baseline");
      server.middlewares.use((request, response, next) => {
        if (!request.url) return next();
        const url = new URL(request.url, "http://causescope.local");
        const send = (body: unknown, statusCode = 200): void => {
          response.statusCode = statusCode;
          response.setHeader("content-type", "application/json; charset=utf-8");
          response.end(JSON.stringify(body));
        };
        if (url.pathname === "/__fixtures/hmr") {
          if (!enableHmrFixture) return next();
          if (request.method !== "POST") {
            send({ error: "Method not allowed" }, 405);
            return;
          }
          const mode = url.searchParams.get("mode");
          if (mode !== "baseline" && mode !== "updated") {
            send({ error: "Unknown HMR fixture mode" }, 400);
            return;
          }
          try {
            send({ label: setHmrFixture(mode) });
          } catch (error) {
            send({ error: error instanceof Error ? error.message : "Unable to update HMR fixture" }, 500);
          }
          return;
        }
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
  plugins: [fixtureApi(process.env.CAUSESCOPE_E2E === "1"), react(), tailwindcss(), causeScope()],
  server: {
    host: "0.0.0.0",
    allowedHosts: ["terminal.local"],
  },
});
