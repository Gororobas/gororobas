import { configDefaults, mergeConfig, type ViteUserConfigExport } from "vitest/config"

import shared from "../../vitest.shared.js"

/**
 * `*.external.test.ts` files call real external services (LLMs, third-party APIs).
 * They are slow, costly or non-deterministic, so they only run through `test:external`.
 */
export const externalTestPattern = "**/*.external.test.ts"

const config: ViteUserConfigExport = {
  test: {
    name: "server",
    exclude: [...configDefaults.exclude, externalTestPattern],
  },
}

export default mergeConfig(shared, config)
