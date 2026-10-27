import { Schema } from 'effect'
import { PublicChild as Child } from '../shared'

export const Satisfied = Schema.Struct({ child: Child.Model }) satisfies unknown
export const Asserted = Schema.Struct({ child: Child.Model }) as unknown
export const NestedWrappers = (Schema.Struct({ child: Child.Model }) satisfies unknown) as unknown
export const WrappedInput = Schema.Struct({ child: (Child.Model satisfies unknown) as unknown })
const alias = Child as typeof Child
export const WrappedAlias = Schema.Struct({ child: alias.Model })
const struct = Schema.Struct as typeof Schema.Struct
export const WrappedConstructor = struct({ child: Child.Model })
