import { defineConfig } from "vitest/config"

export default defineConfig({
  resolve: {
    conditions: ["@pleat/source"],
    alias: [
      {
        find: /^@gororobas\/domain(\/.*)?$/,
        replacement: new URL("../../packages/domain/src", import.meta.url).pathname + "$1",
      },
    ],
  },
  test: {
    include: ["src/**/*.{test,spec}.ts"],
    environment: "happy-dom",
    setupFiles: ["./src/vitest-setup.ts"],
    server: {
      deps: {
        inline: ["foldkit", "@foldkit/ui", "@foldkit/devtools", "@effect/vitest"],
      },
    },
  },
})
