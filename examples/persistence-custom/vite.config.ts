import { defineConfig } from "vite-plus";

export default defineConfig({
  test: { cache: false, silent: "passed-only", include: ["test/**/*.test.ts"] },
  run: {
    tasks: {
      start: { command: "vp build && bun src/server.ts", cache: false },
    },
  },
});
