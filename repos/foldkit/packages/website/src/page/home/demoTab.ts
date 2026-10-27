import { Schema } from 'effect'

import { Tabs } from '@foldkit/ui'

export const Tab = Schema.Literals(['AsyncCounter', 'Note Player'])

export const DemoTabsBlock = Tabs.create<typeof Tab.Type>()

export const all: ReadonlyArray<typeof Tab.Type> = [
  'AsyncCounter',
  'Note Player',
]

export const isActive =
  (tab: typeof Tab.Type) =>
  (activeDemoTab: typeof Tab.Type): boolean =>
    activeDemoTab === tab
