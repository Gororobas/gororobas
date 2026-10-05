import { defineConfig } from "vite-plus";

export default defineConfig({
  run: {
    tasks: {
      "db:generate": { command: "bun ../../scripts/db-generate.ts", cache: false },
      "db:migrate": { command: "bun src/migrations.ts", cache: false },
      start: { command: "vp build && bun src/server.ts", cache: false },
    },
  },
});
