import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";

const runtimeTarget = process.env.CLOG_BACKEND_URL?.trim() || "http://127.0.0.1:6900";
const runtimeWsTarget = runtimeTarget.replace(/^http/u, "ws");

export default defineConfig({
  plugins: [svelte()],
  server: {
    host: "127.0.0.1",
    port: 4173,
    proxy: {
      "/api": {
        target: runtimeTarget,
        changeOrigin: true,
      },
      "/healthz": {
        target: runtimeTarget,
        changeOrigin: true,
      },
      "/ws": {
        target: runtimeWsTarget,
        changeOrigin: true,
        ws: true,
      },
    },
  },
  preview: {
    host: "127.0.0.1",
    port: 4173,
  },
});
