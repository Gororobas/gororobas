import {
  Block,
  Block as AliasedBlock,
} from 'foldkit'
import * as Foldkit from 'foldkit'
import {
  makeDefinition,
  makeDefinition as aliasedMakeDefinition,
  makeNamespace as aliasedMakeNamespace,
} from 'foldkit/block'
import * as BlockModule from 'foldkit/block'

import { ImportedDefinition } from './definition'
import { block as ImportedFeature } from './feature.ts'

const blockName = 'DynamicBlock'

const RootDefinition = Block.makeDefinition('Root', { Model, Message })
const AliasedRootDefinition = AliasedBlock.makeDefinition('AliasedRoot', {
  Model,
  Message,
})
const NamespaceRootNamespace = Foldkit.Block.makeNamespace('NamespaceRoot')
const SubpathDefinition = makeDefinition('Subpath', {
  Model,
  Message,
})
const AliasedSubpathDefinition = aliasedMakeDefinition('AliasedSubpath', {
  Model,
  Message,
})
const AliasedSubpathNamespace = aliasedMakeNamespace('AliasedSubpath')
const SubpathNamespaceNamespace = BlockModule.makeNamespace('SubpathNamespace')
const RegisteredComposition = BlockModule.makeDefinition('Registered', {
  Model,
  Message,
}).makeComposition({})
const IdentityFirstDefinition = Block.makeNamespace(
  'IdentityFirst',
).makeDefinition({ Model, Message })
const IdentityFirstComposition = Block.makeNamespace('IdentityFirst')
  .makeDefinition({ Model, Message })
  .makeComposition({})
const ApplicationDefinition = Block.makeDefinition('Application', {
  Model,
  Message,
})
const ApplicationComposition = Block.makeDefinition('Application', {
  Model,
  Message,
}).makeComposition({})
const DynamicNamespace = AliasedBlock.makeNamespace(blockName)
const ImportedAlias = ImportedFeature

const registry = {
  makeDefinition: (name: string) => name,
  makeNamespace: (name: string) => name,
}
const UnrelatedDefinition = registry.makeDefinition('DifferentName')
const UnrelatedNamespace = registry.makeNamespace('DifferentNamespace')
const unrelatedFactory = {
  makeNamespace: (_name: string) => ({ makeDefinition: () => ({}) }),
}
const UnrelatedChain = unrelatedFactory
  .makeNamespace('DifferentName')
  .makeDefinition()
const unrelatedComposer = { makeComposition: () => ({}) }
const UnrelatedCompositionResult = unrelatedComposer.makeComposition()

const useShadowedBlock = (Block: typeof AliasedBlock) => {
  const LocalBlock = Block.makeDefinition('DifferentName', { Model, Message })

  return LocalBlock
}

void RootDefinition
void AliasedRootDefinition
void NamespaceRootNamespace
void SubpathDefinition
void AliasedSubpathDefinition
void AliasedSubpathNamespace
void SubpathNamespaceNamespace
void RegisteredComposition
void IdentityFirstDefinition
void IdentityFirstComposition
void ApplicationDefinition
void ApplicationComposition
void DynamicNamespace
void ImportedAlias
void UnrelatedDefinition
void UnrelatedNamespace
void UnrelatedChain
void UnrelatedCompositionResult
void useShadowedBlock

const SeparateDefinition = Block.makeDefinition('Separate', { Model, Message })
const SeparateComposition = SeparateDefinition.makeComposition()
const SharedNamespace = Block.makeNamespace('Shared')
const SharedDefinition = SharedNamespace.makeDefinition({ Model, Message })
const SharedComposition = SharedDefinition.makeComposition()
const ImportedResult = ImportedDefinition.makeComposition()
void SeparateComposition
void SharedComposition
void ImportedResult
