import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";
import { watchBackendOpenApi } from "./vite/openapi-watch-mode";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const appName = env.VITE_APP_NAME ?? "App";

  return {
    plugins: [
      tailwindcss(),
      tanstackRouter({
        autoCodeSplitting: true,
        target: "react",
      }),
      react(),
      watchBackendOpenApi(),
      {
        name: "inject-brand-html",
        transformIndexHtml(html) {
          return html.replace(/%VITE_APP_NAME%/g, appName);
        },
      },
    ],
    resolve: {
      alias: {
        "@": path.resolve(import.meta.dirname, "./src"),
      },
    },
  };
});
