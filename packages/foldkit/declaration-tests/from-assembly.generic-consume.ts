import { Layer, Schema } from 'effect'
import { Block } from 'foldkit'

import { Store } from './from-assembly.accepted.js'
import type { Assert, Equal, SameMembers } from './from-assembly.assertions.js'
import { createPicker } from './from-assembly.generic.js'
import { DecodeItem, EncodeItem, ItemSchema } from './from-assembly.generic.js'

export const Numeric = createPicker(Schema.NumberFromString)
export const Literal = createPicker(Schema.Literals(['Red', 'Blue']))
export const WithServices = createPicker(ItemSchema)
export type ExactNumericMembers = Assert<
  SameMembers<typeof Numeric.PickerBlock, typeof Numeric.OriginalPickerBlock>
>
export type ExactLiteralMembers = Assert<
  SameMembers<typeof Literal.PickerBlock, typeof Literal.OriginalPickerBlock>
>
export type Decoded = Assert<
  Equal<typeof Numeric.PickerBlock.Model.Type, Readonly<{ selected: number }>>
>
export type Encoded = Assert<
  Equal<
    typeof Numeric.PickerBlock.Model.Encoded,
    Readonly<{ selected: string }>
  >
>
export type DecodingServices = Assert<
  Equal<typeof WithServices.PickerBlock.Model.DecodingServices, DecodeItem>
>
export type EncodingServices = Assert<
  Equal<typeof WithServices.PickerBlock.Model.EncodingServices, EncodeItem>
>
export type OrdinaryServices = Assert<
  Equal<Layer.Services<typeof Numeric.PickerBlock.EffectsLayer>, Store>
>
export type InitArguments = Assert<
  Equal<Parameters<typeof Numeric.PickerBlock.init>, [selected: number]>
>
export type LiteralOutMessage = Assert<
  Equal<
    typeof Literal.PickerBlock.OutMessage.Type,
    Readonly<{ _tag: 'Selected'; selected: 'Red' | 'Blue' }>
  >
>

export function createDownstreamPicker<Item, EncodedValue, Decoding, Encoding>(
  Item: Schema.Codec<Item, EncodedValue, Decoding, Encoding> & {
    readonly '~type.make': Item
  },
) {
  const result = createPicker(Item)
  const toOriginal: typeof result.OriginalPickerBlock = result.PickerBlock
  const toAnnotated: typeof result.PickerBlock = result.OriginalPickerBlock

  return { result, toOriginal, toAnnotated }
}

Numeric.PickerBlock.operations.select({ selected: 0 }, { selected: 1 })
// @ts-expect-error The emitted generic operation keeps decoded number arguments.
Numeric.PickerBlock.operations.select({ selected: 0 }, { selected: '1' })
Literal.PickerBlock.operations.select(
  { selected: 'Red' },
  // @ts-expect-error The emitted generic operation keeps literal refinement.
  { selected: 'Green' },
)
// @ts-expect-error The emitted initializer retains its required decoded argument.
Numeric.PickerBlock.init()

export const ParentModel = Schema.Struct({ picker: Numeric.PickerBlock.Model })
export const ParentDefinition = Block.makeDefinition('EmittedPickerConsumer', {
  Model: ParentModel,
  Message: Schema.Never,
})
export const PickerBinding = ParentDefinition.makeBinding(Numeric.PickerBlock, {
  field: 'picker',
  init: false,
}).withOutMessagePolicy({
  fold: Numeric.PickerBlock.OutMessage.match({
    Selected: () => ParentDefinition.makeStep(model => ({ model })),
  }),
})
export const embedded = PickerBinding.embedView({
  slotId: 'picker',
  model: { selected: 1 },
  viewInputs: { format: selected => selected.toFixed(1) },
})
// @ts-expect-error The default view retains its required format callback.
PickerBinding.embedView({ slotId: 'picker', model: { selected: 1 } })
