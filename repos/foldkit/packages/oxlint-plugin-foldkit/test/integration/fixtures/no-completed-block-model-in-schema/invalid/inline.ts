import { Schema } from 'effect'
import { inline as child } from '../shared/inline'

export const Parent = Schema.Struct({ child: child.Model })
