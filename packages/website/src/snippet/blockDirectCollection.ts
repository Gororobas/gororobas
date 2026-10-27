import { Block } from 'foldkit'

import { Message } from './message'
import { Model } from './model'
import { Row } from './row'

const TableDefinition = Block.makeDefinition('Table', { Model, Message })

export const RowsBinding = TableDefinition.makeBinding(Row.RowBlock, {
  field: 'rows',
  key: 'id',
})
