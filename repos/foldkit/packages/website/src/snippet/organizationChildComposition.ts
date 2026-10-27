import * as Counter from '../counter'
import { DashboardDefinition } from './definition'

export const CounterBinding = DashboardDefinition.makeBinding(
  Counter.CounterBlock,
  {
    field: 'counter',
  },
)

export const DashboardComposition = DashboardDefinition.makeComposition({
  bindings: [CounterBinding],
})
