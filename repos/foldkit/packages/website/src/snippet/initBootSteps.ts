import {
  ApplicationComposition,
  SessionBinding,
  SettingsBinding,
} from './composition'
import type { Flags } from './flags'

const init = ApplicationComposition.makeInit((flags: Flags) => ({
  model: {},
  steps: [
    SettingsBinding.requestRestore(flags.savedSettings),
    SessionBinding.requestResume(),
  ],
}))
