import { Schema } from 'effect'
import { Block } from 'foldkit'
import {
  PublicHeader,
  WidenedHeader,
  CastHeader,
  InferredModel,
  InferredModelHeader,
  WidenedModelHeader,
} from '../shared/header-barrel'

const Model = Schema.Struct({ count: Schema.Number })
const Composition = Block.makeDefinition('Child', { Model }).makeComposition()
const prepare = () => Composition.prepareBlock({})
const Safe: Block.FromAssemblyWithoutViewOrOutMessage<typeof Model, typeof prepare> = Block.assemble(prepare)
const Reannotated: typeof Safe = Safe
const Cast = Safe as typeof Safe
const AngleCast = <typeof Safe>Safe
const ImportedReannotated: typeof Safe = PublicHeader
const ImportedCast = PublicHeader as typeof Safe
const SameAnnotation: typeof Safe = Safe
const WidenedModel = (Safe as typeof Safe).Model
const ViaWidenedModel: Block.FromAssemblyWithoutViewOrOutMessage<typeof WidenedModel, typeof prepare> = Block.assemble(prepare)
const Inferred = Block.assemble(prepare)
const ModelAlias = Inferred.Model
const ViaInferredModel: Block.FromAssemblyWithoutViewOrOutMessage<typeof Inferred.Model, typeof prepare> = Block.assemble(prepare)
const ViaModelAlias: Block.FromAssemblyWithoutViewOrOutMessage<typeof ModelAlias, typeof prepare> = Block.assemble(prepare)
const ViaImportedModel: Block.FromAssemblyWithoutViewOrOutMessage<typeof InferredModel, typeof prepare> = Block.assemble(prepare)
export const Parent = Schema.Struct({
  reannotated: Reannotated.Model,
  cast: Schema.Option(Schema.Array(Cast.Model)),
  angleCast: AngleCast.Model,
  importedReannotated: ImportedReannotated.Model,
  importedCast: ImportedCast.Model,
  sourceAnnotation: WidenedHeader.Model,
  sourceCast: CastHeader.Model,
  inlineCast: (Safe as ReturnType<typeof prepare>).Model,
  nestedCast: ((Safe as ReturnType<typeof prepare>) satisfies unknown).Model,
  sameAnnotation: SameAnnotation.Model,
  inferredModel: ViaInferredModel.Model,
  modelAlias: ViaModelAlias.Model,
  importedModel: ViaImportedModel.Model,
  sourceModel: InferredModelHeader.Model,
  widenedModel: ViaWidenedModel.Model,
  sourceWidenedModel: WidenedModelHeader.Model,
})
