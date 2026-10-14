import { Schema } from "effect"

import { AuthSubjectId } from "../common/ids.js"
import { Email, TimestampColumn, TimestampedStruct } from "../common/primitives.js"
import { AuthenticationSession } from "./auth-contract.js"

/** @todo rename to SubjectRow? */
export const AccountRow = Schema.Struct({
  ...TimestampedStruct.fields,
  id: AuthSubjectId,
  email: Email,
  isEmailVerified: Schema.Boolean,
  /** Unset while an email sign-up awaits its first code; unclaimed accounts are deleted after a day. */
  claimedAt: Schema.NullOr(TimestampColumn),
})

export type AccountRow = typeof AccountRow.Type

export const CurrentAuthenticationData = Schema.NullOr(
  Schema.Struct({ account: AccountRow, session: AuthenticationSession }),
)
export type CurrentAuthenticationData = typeof CurrentAuthenticationData.Type
