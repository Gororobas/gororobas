import { ApplicationDefinition } from './definition'
import * as Settings from './settings'

// ❌ Bad: this forwarder can never forward an OutMessage.
const BadSettingsBinding = ApplicationDefinition.makeBinding(
  Settings.SettingsBlock,
  {
    field: 'settings',
  },
).withOutMessagePolicy({
  fold: foldSettingsOutMessage,
  forward: () => undefined,
})

// ✅ Good: omit `forward` when every child OutMessage stops here.
const SettingsBinding = ApplicationDefinition.makeBinding(
  Settings.SettingsBlock,
  {
    field: 'settings',
  },
).withOutMessagePolicy({ fold: foldSettingsOutMessage })
