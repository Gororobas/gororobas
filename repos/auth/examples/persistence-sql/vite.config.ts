import { defineConfig } from "vite-plus";

export default defineConfig({
  run: {
    tasks: {
      start: { command: "vp build && bun src/server.ts", cache: false },
      "start:pg": { command: "PERSISTENCE_DIALECT=pg vp run start", cache: false },
    },
  },
});
