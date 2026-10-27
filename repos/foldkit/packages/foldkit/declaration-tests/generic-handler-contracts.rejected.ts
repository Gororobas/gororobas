import { Layer } from 'effect'
import * as Block from 'foldkit/block'

import {
  City,
  CityBlock,
  type ItemSchema,
  makeEchoParts,
  stringEchoParts,
} from './generic-handler-contracts.accepted.js'

export const checkGenericHandlerContracts = <Item extends string, ItemEncoded>(
  Item: ItemSchema<Item, ItemEncoded>,
) => {
  const { composition, init, update, Echo } = makeEchoParts(Item)

  // @ts-expect-error Invariant Args and Message contracts reject String for generic Item.
  const wrongLayer: typeof Echo.layer = stringEchoParts.Echo.layer
  void wrongLayer

  // @ts-expect-error Same-name String handlers cannot satisfy every generic Item contract.
  composition.prepareBlock({
    init,
    update,
    EffectsLayer: stringEchoParts.Echo.layer,
  })

  const prepare = () =>
    composition.prepareBlock({ init, update, EffectsLayer: Echo.layer })
  const completedBlock: Block.FromAssemblyWithoutViewOrOutMessage<
    typeof composition.Model,
    typeof prepare
  > = Block.assemble(prepare)
  return completedBlock
}

const cityParts = makeEchoParts(City)
// @ts-expect-error The concrete handler must preserve the City payload.
cityParts.composition.prepareBlock({
  init: cityParts.init,
  update: cityParts.update,
  EffectsLayer: stringEchoParts.Echo.layer,
})

// @ts-expect-error Generic completion preserves the concrete Message payload.
CityBlock.Message.CompletedEcho({ value: 'Mars' })
// @ts-expect-error Generic completion preserves the init argument type.
CityBlock.init(123)
const optionalView = cityParts.composition.makeView((_model, h) => h.div([]))
type MissingHandlerWithOptionalView = Readonly<{
  init: typeof cityParts.init
  update: typeof cityParts.update
  EffectsLayer: typeof Layer.empty
  view?: typeof optionalView
}>
// @ts-expect-error An optional view must not bypass local handler completeness.
cityParts.composition.prepareBlock<MissingHandlerWithOptionalView>({
  init: cityParts.init,
  update: cityParts.update,
  EffectsLayer: Layer.empty,
})

type MissingHandlerWithOptionalEffects = Readonly<{
  init: typeof cityParts.init
  update: typeof cityParts.update
  EffectsLayer?: typeof Layer.empty
}>
// @ts-expect-error An optional Layer must not bypass local handler completeness.
cityParts.composition.prepareBlock<MissingHandlerWithOptionalEffects>({
  init: cityParts.init,
  update: cityParts.update,
})
