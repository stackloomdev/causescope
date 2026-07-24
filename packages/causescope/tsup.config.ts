import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    vite: "src/vite.ts",
    runtime: "src/runtime.ts",
    "adapters/react-query": "src/adapters/react-query.ts",
    "adapters/zustand": "src/adapters/zustand.ts",
  },
  format: ["esm"],
  target: "es2022",
  platform: "node",
  sourcemap: true,
  clean: true,
  splitting: true,
  noExternal: [/^@causescope\//],
  external: ["vite"],
});
