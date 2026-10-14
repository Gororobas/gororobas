import { foldkit } from "@foldkit/vite-plugin"
import tailwindcss from "@tailwindcss/vite"
import { defineConfig } from "vite"

export default defineConfig({
  plugins: [tailwindcss(), foldkit()],
  server: {
    host: true,
    port: 4443,
    strictPort: true,
    proxy: {
      "/api/auth": {
        target: "http://localhost:4000",
        changeOrigin: false,
      },
      "/api": {
        target: "http://localhost:4000",
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
})
