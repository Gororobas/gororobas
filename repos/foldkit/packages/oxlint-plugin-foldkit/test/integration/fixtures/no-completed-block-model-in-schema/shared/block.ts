import { Block } from 'foldkit'

import { ChildComposition as Composition } from './composition'

const prepare = () =>
  Composition.prepareBlock({
    init: () => ({ model: { count: 0 } }),
    update: model => ({ model }),
  })
const completed = Block.assemble(prepare)
export { completed as ChildBlock }
