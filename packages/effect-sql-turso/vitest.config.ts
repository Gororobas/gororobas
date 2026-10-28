import { mergeConfig, type ViteUserConfigExport } from "vitest/config"

import shared from "../../vitest.shared.js"

const config: ViteUserConfigExport = { test: { sequence: { concurrent: false } } }

export default mergeConfig(shared, config)
