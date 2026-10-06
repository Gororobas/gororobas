import { Schema } from "effect"

import { AuthSubjectId } from "../common/ids.js"
import { Email, TimestampedStruct } from "../common/primitives.js"
import { AuthenticationSession } from "./auth-contract.js"

export const AccountRow = Schema.Struct({
  ...TimestampedStruct.fields,
  id: AuthSubjectId,
  name: Schema.String,
  email: Email,
  isEmailVerified: Schema.Boolean,
  image: Schema.NullOr(Schema.String),
})

export type AccountRow = typeof AccountRow.Type

export const CurrentAuthenticationData = Schema.NullOr(
  Schema.Struct({ account: AccountRow, session: AuthenticationSession }),
)
export type CurrentAuthenticationData = typeof CurrentAuthenticationData.Type
