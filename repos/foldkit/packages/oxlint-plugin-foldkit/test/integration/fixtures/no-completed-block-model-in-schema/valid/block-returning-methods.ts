import { Schema } from 'effect'
import { Block } from 'foldkit'

const Model = Schema.Struct({ count: Schema.Number })
const Composition = Block.makeDefinition('Child', { Model }).makeComposition()
const prepare = () => Composition.prepareBlock({})
const Safe: Block.FromAssemblyWithoutViewOrOutMessage<typeof Model, typeof prepare> = Block.assemble(prepare)
const Registry = {
  provideHandlers: () => ({ Model: Schema.String }),
  replaceEffectsLayer: () => ({ Model: Schema.Number }),
}
const Provided = Registry.provideHandlers()
const Replaced = Registry.replaceEffectsLayer()
export const Parent = Schema.Struct({
  safe: Safe.Model,
  provided: Provided.Model,
  replaced: Replaced.Model,
  direct: Registry.provideHandlers().Model,
})
export const ordinaryProvided = Safe.provideHandlers
export type ChildModel = typeof Safe.Model.Type
