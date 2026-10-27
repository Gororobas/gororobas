import { Block as RootBlock } from 'foldkit'
import * as Block from 'foldkit/block'
import { makeDefinition as makeBlockDefinition } from 'foldkit/block'

const makeFromNamespaceImport = () => {
  const ApplicationDefinition = Block.makeDefinition('Application', {
    Model,
    Message,
  })
  return ApplicationDefinition
}

const makeFromAliasedImport = () => {
  const ApplicationDefinition = makeBlockDefinition('Application', {
    Model,
    Message,
  })
  return ApplicationDefinition
}

const ApplicationDefinition = RootBlock.makeDefinition('Application', {
  Model,
  Message,
})
const ApplicationComposition = ApplicationDefinition.makeComposition()

void makeFromNamespaceImport
void makeFromAliasedImport
void ApplicationComposition
