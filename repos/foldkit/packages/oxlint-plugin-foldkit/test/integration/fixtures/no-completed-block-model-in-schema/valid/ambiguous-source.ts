import { Schema } from 'effect'
import { Registry } from '../shared/nested-template'
import { Child } from '../shared/regex-scope'

export const NestedTemplateParent = Schema.Struct({ child: Registry.Model })
export const RegexParent = Schema.Struct({ child: Child.Model })
