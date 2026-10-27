import type { Block } from 'foldkit'

import { NestedDefinition } from '../definition.js'

export const NestedComposition = NestedDefinition.makeComposition()
export type NestedViewBuilder = Block.ViewBuilderFor<typeof NestedComposition>
