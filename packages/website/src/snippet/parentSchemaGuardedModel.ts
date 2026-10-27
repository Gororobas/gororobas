// ✅ Compose state from a checked completed Block boundary.
import { Schema } from 'effect'

import { SettingsBlock } from './blockSettings'

export const Model = Schema.Struct({ settings: SettingsBlock.Model })
