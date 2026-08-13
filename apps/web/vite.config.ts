import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [vue()],
  server: {
    port: 5173,
    // Mirrors the prod Caddy `handle_path /api/*` exactly, so the client only
    // ever knows the relative base "/api". Same origin in dev and in prod means
    // no CORS, no preflight, and one bundle for every environment.
    proxy: {
      "/api": {
        target: "http://localhost:3000",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ""),
        // SSE: without this the progress bar sits at 0 % for the whole encode
        // and then jumps to done.
        configure: (proxy) => {
          proxy.on("proxyRes", (proxyRes) => {
            if (proxyRes.headers["content-type"]?.includes("text/event-stream")) {
              proxyRes.headers["cache-control"] = "no-cache, no-transform";
            }
          });
        },
      },
    },
  },
});
