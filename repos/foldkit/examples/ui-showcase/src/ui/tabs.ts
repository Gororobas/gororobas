import { Tabs } from '@foldkit/ui'

import type { DemoTab } from './domain'

export const DemoTabsBlock = Tabs.create<typeof DemoTab.Type>()
