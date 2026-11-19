import { defineConfig } from "vite"

export default defineConfig({
  build: { modulePreload: { polyfill: false } },
  server: {
    host: "127.0.0.1",
    port: 4560,
    strictPort: true,
    proxy: { "/api": "http://127.0.0.1:4561" },
  },
})
