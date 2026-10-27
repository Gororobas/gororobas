import { Menu, Tabs } from '@foldkit/ui'

import { Step } from './domain'

export const StepMenuBlock = Menu.create<typeof Step.Step.Type>()
export const StepTabsBlock = Tabs.create<typeof Step.Step.Type>()
