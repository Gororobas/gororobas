import { Schema } from "effect"

import { AccountId, OAuthAccountId, SessionId, VerificationId } from "../common/ids.js"
import { Email, TimestampColumn, TimestampedStruct } from "../common/primitives.js"

export const AccountRow = Schema.Struct({
  ...TimestampedStruct.fields,
  id: AccountId,
  name: Schema.String,
  email: Email,
  isEmailVerified: Schema.Boolean,
  image: Schema.NullOr(Schema.String),
})
export type AccountRow = typeof AccountRow.Type

export const SessionRow = Schema.Struct({
  ...TimestampedStruct.fields,
  id: SessionId,
  accountId: AccountId,
  expiresAt: TimestampColumn,
  token: Schema.String,
  ipAddress: Schema.NullOr(Schema.String),
  userAgent: Schema.NullOr(Schema.String),
})
export type SessionRow = typeof SessionRow.Type

export const OAuthAccountRow = Schema.Struct({
  ...TimestampedStruct.fields,
  id: OAuthAccountId,
  accountId: AccountId,
  providerId: Schema.String,
  oauthAccountId: Schema.String,
  accessToken: Schema.NullOr(Schema.String),
  refreshToken: Schema.NullOr(Schema.String),
  idToken: Schema.NullOr(Schema.String),
  scope: Schema.NullOr(Schema.String),
  password: Schema.NullOr(Schema.String),
  accessTokenExpiresAt: Schema.NullOr(TimestampColumn),
  refreshTokenExpiresAt: Schema.NullOr(TimestampColumn),
})
export type OAuthAccountRow = typeof OAuthAccountRow.Type

export const VerificationRow = Schema.Struct({
  ...TimestampedStruct.fields,
  id: VerificationId,
  expiresAt: TimestampColumn,
  identifier: Schema.String,
  value: Schema.String,
})
export type VerificationRow = typeof VerificationRow.Type

export const CurrentAuthenticationData = Schema.NullOr(
  Schema.Struct({ account: AccountRow, session: SessionRow }),
)
export type CurrentAuthenticationData = typeof CurrentAuthenticationData.Type
