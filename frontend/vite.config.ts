import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";

// Frontend-only edition: `npm run build` writes a static site to ./dist (deployable to Vercel or any static host).
// The /api proxy is only used when VITE_DATA_MODE=api (PHP backend on the `backend` branch).
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  return {
    base: env.VITE_BASE || "/",
    plugins: [react(), tailwindcss()],
    resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
    server: {
      port: 5173,
      proxy: {
        "/api": {
          target: env.LEADFORGE_API_TARGET || "http://localhost",
          changeOrigin: true,
          rewrite: (p) => p.replace(/^\/api/, env.LEADFORGE_API_PATH ?? "/leadforge/api"),
        },
      },
    },
    build: {
      outDir: "dist",
      chunkSizeWarningLimit: 1200,
    },
  };
});
