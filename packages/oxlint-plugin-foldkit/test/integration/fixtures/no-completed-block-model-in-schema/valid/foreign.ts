import { Schema } from 'effect'
import { ChildBlock } from '../shared/foreign'

export const Parent = Schema.Struct({ child: ChildBlock.Model })
