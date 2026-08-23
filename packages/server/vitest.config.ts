import { mergeConfig, type ViteUserConfigExport } from "vitest/config"

import shared from "../../vitest.shared.js"

const config: ViteUserConfigExport = {}

export default mergeConfig(shared, config)
