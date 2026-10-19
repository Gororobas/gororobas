import { foldkit } from "@foldkit/vite-plugin"
import tailwindcss from "@tailwindcss/vite"
import { defineConfig, loadEnv } from "vite"

import { offlineShell } from "./offline-shell-plugin.ts"

export default defineConfig(({ mode }) => {
  // Separate ports let several app instances (e.g. one per agent worktree) run side by side.
  const environment = loadEnv(mode, import.meta.dirname, ["WEB_PORT", "API_PORT"])
  const apiOrigin = `http://localhost:${environment.API_PORT ?? 4000}`

  return {
    plugins: [tailwindcss(), foldkit(), offlineShell()],
    server: {
      host: true,
      port: Number(environment.WEB_PORT ?? 4443),
      strictPort: true,
      proxy: {
        "/api/auth": {
          target: apiOrigin,
          changeOrigin: false,
        },
        "/api": {
          target: apiOrigin,
          changeOrigin: false,
          rewrite: (path) => path.replace(/^\/api/, ""),
        },
      },
    },
    resolve: {
      alias: [
        {
          find: /^@gororobas\/domain(\/.*)?$/,
          replacement: new URL("../../packages/domain/src", import.meta.url).pathname + "$1",
        },
      ],
    },
    optimizeDeps: {
      entries: ["src/entry.ts"],
    },
  }
})
