import { Schema } from 'effect'
import * as Public from '../shared/namespace'
import { ChildBlock } from '../shared/with-literals'

const namespace = Public
export const Namespaced = Schema.Struct({ child: namespace.Nested.PublicChild.Model })
export const WithLiterals = Schema.Struct({ child: ChildBlock.Model })
