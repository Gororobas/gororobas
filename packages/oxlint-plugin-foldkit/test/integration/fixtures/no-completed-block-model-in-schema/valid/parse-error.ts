import { Schema } from 'effect'
import { Broken } from '../shared/parse-error'

export const Parent = Schema.Struct({ child: Broken.Model })
