import * as Block from 'foldkit/block'
import { makeDefinition as makeBlockDefinition } from 'foldkit/block'

const WrongNamespaceImport = Block.makeDefinition('Application', {
  Model,
  Message,
})
const WrongAliasedImport = makeBlockDefinition('Application', {
  Model,
  Message,
})

void WrongNamespaceImport
void WrongAliasedImport
