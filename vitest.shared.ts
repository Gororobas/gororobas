import * as path from "node:path"
import type { ViteUserConfig } from "vitest/config"

const alias = (name: string) => {
  const target = process.env.TEST_DIST !== undefined ? "dist/dist/esm" : "src"
  return {
    [`${name}/test`]: path.join(__dirname, "packages", name, "test"),
    [`@gororobas/${name}`]: path.join(__dirname, "packages", name, target),
  }
}

// This is a workaround, see https://github.com/vitest-dev/vitest/issues/4744
const config: ViteUserConfig = {
  esbuild: {
    target: "es2020",
  },
  optimizeDeps: {
    exclude: ["bun:sqlite"],
  },
  test: {
    alias: {
      ...alias("cli"),
      ...alias("domain"),
      ...alias("effect-bdd"),
      ...alias("server"),
    },
    fakeTimers: {
      toFake: undefined,
    },
    include: ["**/*.test.ts"],
    testTimeout: 30000,
    sequence: {
      concurrent: true,
    },
    setupFiles: [path.join(__dirname, "setup-tests.ts")],
  },
}

export default config
