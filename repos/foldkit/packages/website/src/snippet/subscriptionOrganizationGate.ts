import { ApplicationDefinition } from './definition'
import * as Settings from './settings'

export const SettingsBinding = ApplicationDefinition.makeBinding(
  Settings.SettingsBlock,
  {
    field: 'settings',
    subscriptions: {
      when: ({ route }) => route._tag === 'Settings',
    },
  },
)
