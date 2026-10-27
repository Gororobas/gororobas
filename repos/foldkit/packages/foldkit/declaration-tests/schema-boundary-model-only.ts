import { Schema } from 'effect'

import * as Child from './schema-boundary-public.js'
export const Model = Schema.Struct({ child: Child.Model })
