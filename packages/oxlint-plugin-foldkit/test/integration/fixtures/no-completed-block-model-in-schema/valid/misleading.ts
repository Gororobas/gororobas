import { Schema } from 'effect'
import { FakeBlock } from '../shared/misleading'

export const Parent = Schema.Struct({ child: FakeBlock.Model })
