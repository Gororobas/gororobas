import { Block } from 'foldkit'

import { SnippetDisclosureComposition } from './composition'
import { init } from './init'
import type { Model } from './model'
import { MeasureSnippetHeight } from './mount'
import { update } from './update'
import { view } from './view'

export const EffectsLayer = MeasureSnippetHeight.layer

const prepare = () =>
  SnippetDisclosureComposition.prepareBlock({
    init,
    update,
    view,
    EffectsLayer,
  })
export const SnippetDisclosureBlock: Block.FromAssemblyWithView<
  typeof Model,
  typeof prepare
> = Block.assemble(prepare)
