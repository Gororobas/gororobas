import { mergeConfig, type ViteUserConfigExport } from "vitest/config"

import shared from "../../vitest.shared.js"
import { externalTestPattern } from "./vitest.config.js"

const config: ViteUserConfigExport = {
  test: {
    name: "server-external",
    include: [externalTestPattern],
    sequence: { concurrent: false },
  },
}

export default mergeConfig(shared, config)
