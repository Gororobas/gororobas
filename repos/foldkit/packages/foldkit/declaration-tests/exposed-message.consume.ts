import {
  ChildBlock,
  ChildModel,
  ContextBlock,
  ContextModel,
  ExactBlock,
  ExactModel,
  FruitChoice,
  ManagedMountedChoiceBlock,
  MountedChoiceBlock,
  MountedChoiceModel,
  ParentBlock,
  ParentModel,
  ProvidedFruitChoice,
} from './exposed-message.accepted.js'

ChildBlock.operations.reset(ChildModel.make({ value: '' }))
ChildBlock.operations.setValue(ChildModel.make({ value: '' }), 'next')
ContextBlock.operations.setRequired(ContextModel.make({ value: '' }), 'next', {
  source: 'consumer',
})
FruitChoice.operations.select(
  FruitChoice.Model.make({ selected: 'Apple' }),
  'Pear',
  { source: 'consumer' },
)
ProvidedFruitChoice.operations.select(
  ProvidedFruitChoice.Model.make({ selected: 'Pear' }),
  'Apple',
  { source: 'provided-consumer' },
)
MountedChoiceBlock.operations.select(
  MountedChoiceModel.make({ selected: 'Apple' }),
  'Pear',
)
ManagedMountedChoiceBlock.operations.select(
  MountedChoiceModel.make({ selected: 'Pear' }),
  'Apple',
)
ParentBlock.operations.setEntry(
  ParentModel.make({ child: { value: '' }, entries: [] }),
  'first',
  'next',
)

ExactBlock.operations.pingWithMetadata(ExactModel.make({ value: 'metadata' }))
