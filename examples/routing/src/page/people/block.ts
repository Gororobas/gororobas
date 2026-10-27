import { Layer } from 'effect'
import { Block } from 'foldkit'

import { FetchPeople, PushSearchUrl } from './command'
import { PeopleComposition } from './composition'
import { Message } from './message'
import type { Model } from './model'
import { init, update } from './update'
import { view } from './view'

const EffectsLayer = Layer.mergeAll(PushSearchUrl.layer, FetchPeople.layer)

const prepare = () =>
  PeopleComposition.prepareBlock({
    init,
    update,
    view,
    EffectsLayer,
    operations: { informRouteChanged: Message.InformedOfRouteChange },
  })
export const PeopleBlock: Block.FromAssemblyWithView<
  typeof Model,
  typeof prepare
> = Block.assemble(prepare)
