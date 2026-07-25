import react from "@vitejs/plugin-react-swc";
import { defineConfig } from "vite";
import causeScope from "causescope/vite";

export default defineConfig({
  plugins: [react(), causeScope()],
});
