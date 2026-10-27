import {
  ChildBinding,
  ChildBlock,
  ChildModel,
} from './exposed-rest.accepted.js'

const model = ChildModel.make({ count: 0 })
// @ts-expect-error The required variadic prefix cannot be omitted.
ChildBlock.operations.addRequiredPrefix(model)
// @ts-expect-error Variadic labels must be strings.
ChildBlock.operations.addRequiredPrefix(model, 1, 2)
// @ts-expect-error Binding operations preserve a required variadic prefix.
ChildBinding.addRequiredPrefix()
// @ts-expect-error Binding operations preserve variadic label types.
ChildBinding.addRequiredPrefix(1, 2)
// @ts-expect-error Refined rest elements do not widen to arbitrary numbers.
ChildBinding.addRefined(3)
// @ts-expect-error The optional numeric prefix cannot be a label.
ChildBinding.addOptionalPrefix('First')
