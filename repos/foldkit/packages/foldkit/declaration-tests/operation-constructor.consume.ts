import { Option } from 'effect'

import {
  ChildBinding,
  ChildBlock,
  Choice,
  EntryBinding,
  Model,
  type OperationConstructorAssertions,
  ParentBlock,
  ParentModel,
} from './operation-constructor.accepted.js'

const model = Model.make({ value: '' })

ChildBlock.operations.resetValue(model, { prefix: 'reset' })
ChildBlock.operations.updateValue(model, { value: 'next' }, { prefix: 'set' })
ChildBlock.operations.updateValue(
  model,
  { value: 'next', source: 'explicit' },
  { prefix: 'set' },
  undefined,
  undefined,
  1,
  2,
)
ChildBlock.operations.updatePositionally(model, 'next', { prefix: 'factory' })
ChildBlock.operations.updateRefined(model, 'First')
ChildBinding.resetValue({ prefix: 'direct' })
ChildBinding.updateValue({ value: 'direct' }, { prefix: 'direct' })
EntryBinding.updateValue('first', { value: 'keyed' }, { prefix: 'keyed' })
Choice.operations.select(Choice.Model.make({ selected: 'First' }), {
  value: 'Second',
})
Choice.operations.selectPositionally(
  Choice.Model.make({ selected: 'First' }),
  'Second',
)

export type ExactOperationConstructorAssertions = OperationConstructorAssertions

ParentBlock.operations.updateChild(
  ParentModel.make({ maybeChild: Option.none(), entries: [] }),
  { value: 'parent' },
)
