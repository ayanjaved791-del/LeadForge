import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";

// Dev: the React app runs on Vite (http://localhost:5173) and /api is proxied to the PHP API in XAMPP,
// so the session cookie stays same-origin. Production: `npm run build` writes static files to ../app.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  return {
    base: env.VITE_BASE || "/leadforge/app/",
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
      outDir: "../app",
      emptyOutDir: true,
      chunkSizeWarningLimit: 1200,
    },
  };
});
