import { Schema } from 'effect'
import { Message as MessageModule } from 'foldkit'

import { Count } from './schema-boundary-model.js'
export const Message = MessageModule.defineMessageUnion({
  RequestedLoad: { key: Schema.Literals(['Primary', 'Secondary']) },
  CompletedLoad: { count: Count },
})
