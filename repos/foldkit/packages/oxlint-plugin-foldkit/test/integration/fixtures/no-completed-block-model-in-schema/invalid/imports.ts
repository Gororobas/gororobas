import { Schema as S } from 'effect'
import * as Schemas from 'effect/Schema'

import { PublicChild as Child } from '../shared'
import * as Feature from '../shared'

const blockAlias = Child
const schemaAlias = S
const struct = schemaAlias.Struct
const childSchema = blockAlias.Model
const fields = { child: childSchema }

export const Parent = struct(fields)
export const OptionalParent = Schemas.Struct({
  nested: S.Struct({ child: S.Option(Feature.PublicChild.Model) }),
  repeated: S.Array(Child.Model),
})

export const Dictionary = S.Struct({
  nested: S.Record(S.String, S.Array(S.Option(Child.Model))),
})
