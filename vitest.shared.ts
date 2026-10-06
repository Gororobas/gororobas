import { NodePath } from "@effect/platform-node"
import { Effect, Path } from "effect"
import type { ViteUserConfig } from "vitest/config"

const path = Effect.runSync(Effect.provide(Path.Path, NodePath.layer))

const alias = (name: string) => {
  const target = process.env.TEST_DIST !== undefined ? "dist/dist/esm" : "src"
  const packageRoot = name === "server" ? "apps/server" : path.join("packages", name)
  return {
    [`${name}/test`]: path.join(import.meta.dirname, packageRoot, "test"),
    [`@gororobas/${name}`]: path.join(import.meta.dirname, packageRoot, target),
  }
}

// This is a workaround, see https://github.com/vitest-dev/vitest/issues/4744
const config: ViteUserConfig = {
  optimizeDeps: {
    exclude: ["node:sqlite"],
  },
  test: {
    alias: {
      ...alias("cli"),
      ...alias("domain"),
      ...alias("effect-bdd"),
      ...alias("effect-sql-turso-browser"),
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
    setupFiles: [path.join(import.meta.dirname, "setup-tests.ts")],
  },
}

export default config
