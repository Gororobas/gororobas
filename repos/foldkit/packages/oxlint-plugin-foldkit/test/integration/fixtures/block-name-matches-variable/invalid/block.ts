import {
  Block,
  Block as AliasedBlock,
} from 'foldkit'
import * as Foldkit from 'foldkit'
import {
  makeDefinition,
  makeNamespace as aliasedMakeNamespace,
} from 'foldkit/block'
import * as BlockModule from 'foldkit/block'

const WrongRoot = Block.makeDefinition('Root', { Model, Message })
const WrongAliasedRoot = AliasedBlock.makeDefinition('AliasedRoot', {
  Model,
  Message,
})
const WrongNamespaceRoot = Foldkit.Block.makeNamespace('NamespaceRoot')
const WrongSubpathDefinition = makeDefinition('Subpath', {
  Model,
  Message,
})
const WrongAliasedSubpathNamespace = aliasedMakeNamespace('SubpathNamespace')
const WrongRegistered = BlockModule.makeDefinition('Registered', {
  Model,
  Message,
}).makeComposition({})
const WrongIdentityFirst = Block.makeNamespace(
  'IdentityFirst',
).makeDefinition({ Model, Message })
const WrongIdentityComposition = Block.makeNamespace('IdentityComposition')
  .makeDefinition({ Model, Message })
  .makeComposition({})
const WrongApplication = Block.makeDefinition('Application', { Model, Message })
const WrongRegisteredApplication = Block.makeDefinition('Application', {
  Model,
  Message,
}).makeComposition({})

void WrongRoot
void WrongAliasedRoot
void WrongNamespaceRoot
void WrongSubpathDefinition
void WrongAliasedSubpathNamespace
void WrongRegistered
void WrongIdentityFirst
void WrongIdentityComposition
void WrongApplication
void WrongRegisteredApplication

const SeparateDefinition = Block.makeDefinition('Separate', { Model, Message })
const WrongSeparateComposition = SeparateDefinition.makeComposition()
const SharedNamespace = Block.makeNamespace('Shared')
const WrongShared = SharedNamespace.makeDefinition({ Model, Message })
void WrongSeparateComposition
void WrongShared
