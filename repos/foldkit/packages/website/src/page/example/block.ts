import { Block } from 'foldkit'

import { ExampleDetailComposition } from './composition'
import { EffectsLayer, init, update, view } from './example'
import { Message } from './message'
import type { Model } from './model'

export { mounts } from './composition'
export {
  CurrentSourcesAsyncData,
  EffectsLayer,
  init,
  LoadExampleSources,
  Message,
  Model,
  tableOfContents,
  update,
  view,
} from './example'

const prepare = () =>
  ExampleDetailComposition.prepareBlock({
    init,
    update,
    view,
    operations: {
      informRouteChanged: Message.InformedOfRouteChange,
    },
    EffectsLayer,
  })
export const ExampleDetailBlock: Block.FromAssemblyWithView<
  typeof Model,
  typeof prepare
> = Block.assemble(prepare)
