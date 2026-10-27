import { Layer, Schema } from 'effect'
import { Block } from 'foldkit'
import {
  ProvidedHeader,
  ReplacedHeader,
  ProvidedInferred,
  ReplacedInferred,
} from '../shared/header-barrel'

const Model = Schema.Struct({ count: Schema.Number })
const Composition = Block.makeDefinition('Child', { Model }).makeComposition()
const prepare = () => Composition.prepareBlock({})
const Raw = Block.assemble(prepare)
const Safe: Block.FromAssemblyWithoutViewOrOutMessage<typeof Model, typeof prepare> = Block.assemble(prepare)
const RawProvided = Raw.provideHandlers(Layer.empty)
const RawReplaced = Raw.replaceEffectsLayer(Layer.empty)
const SafeProvided = Safe.provideHandlers(Layer.empty)
const SafeReplaced = Safe.replaceEffectsLayer(Layer.empty)
const Alias = SafeProvided
const RawChain = Raw.replaceEffectsLayer(Layer.empty).provideHandlers(Layer.empty)
const SafeChain = Safe.provideHandlers(Layer.empty).replaceEffectsLayer(Layer.empty)
export const Parent = Schema.Struct({
  rawProvided: RawProvided.Model,
  rawReplaced: RawReplaced.Model,
  safeProvided: SafeProvided.Model,
  safeReplaced: SafeReplaced.Model,
  alias: Alias.Model,
  rawChain: RawChain.Model,
  safeChain: SafeChain.Model,
  direct: Schema.Option(Schema.Array(Safe.provideHandlers(Layer.empty).Model)),
  providedHeader: ProvidedHeader.Model,
  replacedHeader: ReplacedHeader.Model,
  providedInferred: ProvidedInferred.Model,
  replacedInferred: ReplacedInferred.Model,
})
