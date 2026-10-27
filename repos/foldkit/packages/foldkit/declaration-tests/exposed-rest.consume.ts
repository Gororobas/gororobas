import {
  ChildBinding,
  ChildBlock,
  ChildModel,
  type EmittedRestProof,
} from './exposed-rest.accepted.js'

const model = ChildModel.make({ count: 0 })
ChildBlock.operations.addMany(model, 1, 2)
ChildBlock.operations.addRequiredPrefix(model, 1, 'First', 'Second')
ChildBlock.operations.addOptionalPrefix(model)
ChildBlock.operations.addOptionalPrefix(model, undefined, 'Optional')
ChildBinding.addMixed(1, 'Second')
ChildBinding.addRefined(1, 2)
ChildBinding.reset()

export type ExactEmittedArguments = EmittedRestProof
