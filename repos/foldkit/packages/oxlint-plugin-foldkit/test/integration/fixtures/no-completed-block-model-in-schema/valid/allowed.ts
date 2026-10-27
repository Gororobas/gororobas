import { Schema } from 'effect'

import { Model, PublicChild as Child } from '../shared'

export const Parent = Schema.Struct({ child: Model })
export type ChildModel = typeof Child.Model.Type
export const publicSchema = Child.Model
export const initial = Child.Model.make({ count: 0 })
export const decoder = Schema.decodeUnknownSync(Child.Model)
export const predicate = Schema.is(Child.Model)
export const ordinaryRecord = { child: Child.Model }
export const consumesValue = (consume: (schema: unknown) => unknown) =>
  consume(Child.Model)

const unrelated = { Model: Schema.String }
const unknownFactory = () => ({ Model: Schema.String })
const UnknownBlock = unknownFactory()
export const Other = Schema.Struct({
  unrelated: unrelated.Model,
  unknown: UnknownBlock.Model,
})

export const shadowed = (Child: { Model: typeof Schema.String }) =>
  Schema.Struct({ child: Child.Model })

export const foreignSchema = (
  Schema: { Struct: (fields: unknown) => unknown },
) => Schema.Struct({ child: Child.Model })

export const wrappedValue = Child.Model satisfies unknown
export type WrappedType = typeof Child.Model.Type
export const wrappedCanonical = Schema.Struct({ child: Model }) satisfies unknown
export const aliasedShadow = (Child: { Model: typeof Schema.String }) => {
  const alias = Child
  return Schema.Struct({ child: alias.Model })
}
export const constructorShadow = (
  Schema: { Struct: (fields: unknown) => unknown },
) => {
  const struct = Schema.Struct
  return struct({ child: Child.Model })
}
