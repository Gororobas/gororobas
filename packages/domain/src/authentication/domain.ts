import { Schema } from "effect"

import { AccountId, OAuthAccountId, SessionId, VerificationId } from "../common/ids.js"
import { Email, TimestampedStruct } from "../common/primitives.js"

export const AccountRow = Schema.Struct({
  ...TimestampedStruct.fields,
  id: AccountId,
  name: Schema.String,
  email: Email,
  isEmailVerified: Schema.Boolean,
  image: Schema.NullishOr(Schema.String),
})
export type AccountRow = typeof AccountRow.Type

export const SessionRow = Schema.Struct({
  ...TimestampedStruct.fields,
  id: SessionId,
  accountId: AccountId,
  expiresAt: Schema.DateFromString,
  token: Schema.String,
  ipAddress: Schema.NullishOr(Schema.String),
  userAgent: Schema.NullishOr(Schema.String),
})
export type SessionRow = typeof SessionRow.Type

export const OAuthAccountRow = Schema.Struct({
  ...TimestampedStruct.fields,
  id: OAuthAccountId,
  accountId: AccountId,
  providerId: Schema.String,
  oauthAccountId: Schema.String,
  accessToken: Schema.NullishOr(Schema.String),
  refreshToken: Schema.NullishOr(Schema.String),
  idToken: Schema.NullishOr(Schema.String),
  scope: Schema.NullishOr(Schema.String),
  password: Schema.NullishOr(Schema.String),
  accessTokenExpiresAt: Schema.NullishOr(Schema.DateFromString),
  refreshTokenExpiresAt: Schema.NullishOr(Schema.DateFromString),
})
export type OAuthAccountRow = typeof OAuthAccountRow.Type

export const VerificationRow = Schema.Struct({
  ...TimestampedStruct.fields,
  id: VerificationId,
  expiresAt: Schema.DateFromString,
  identifier: Schema.String,
  value: Schema.String,
})
export type VerificationRow = typeof VerificationRow.Type

export const CurrentAuthenticationData = Schema.NullOr(
  Schema.Struct({ account: AccountRow, session: SessionRow }),
)
export type CurrentAuthenticationData = typeof CurrentAuthenticationData.Type
