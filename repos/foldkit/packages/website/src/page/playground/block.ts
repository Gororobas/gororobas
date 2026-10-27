import { Block } from 'foldkit'

import { PlaygroundComposition } from './composition'
import type { Model } from './definition'
import { Message } from './definition'
import {
  EffectsLayer,
  init,
  managedResources,
  update,
  view,
} from './playground'

const prepare = () =>
  PlaygroundComposition.prepareBlock({
    init,
    update,
    view,
    managedResources,
    EffectsLayer,
    operations: { informSupport: Message.InformedOfSupport },
  })
export const PlaygroundBlock: Block.FromAssemblyWithView<
  typeof Model,
  typeof prepare
> = Block.assemble(prepare)
