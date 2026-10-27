import { RadioGroup } from '@foldkit/ui'

import type { Plan } from './domain'

export const PlanRadioGroupBlock = RadioGroup.create<typeof Plan.Type>()
