import { AuthSecurityRevision, AuthSubjectId, Email, OAuthProvider } from "@gororobas/domain"
import { Schema } from "effect"
import { SqlClient, SqlSchema } from "effect/sql"

export const findAccountSecurityByEmail = SqlSchema.findOneOption({
  Request: Email,
  Result: Schema.Struct({
    id: AuthSubjectId,
    active: Schema.BooleanFromBit,
    securityRevision: AuthSecurityRevision,
  }),
  execute: (email) =>
    SqlClient.SqlClient.use(
      (sql) => sql`SELECT id, active, security_revision FROM auth_subjects WHERE email = ${email}`,
    ),
})

export const findOAuthIdentity = SqlSchema.findOneOption({
  Request: Schema.Struct({
    provider: OAuthProvider,
    issuer: Schema.String,
    subject: Schema.String,
  }),
  Result: Schema.Struct({
    authSubjectId: AuthSubjectId,
    credentialId: Schema.String,
    active: Schema.BooleanFromBit,
    credentialActive: Schema.BooleanFromBit,
  }),
  execute: ({ provider, issuer, subject }) =>
    SqlClient.SqlClient.use(
      (sql) => sql`
    SELECT i.auth_subject_id, i.credential_id, s.active, c.active AS credential_active
    FROM auth_oauth_identities i JOIN auth_subjects s ON s.id = i.auth_subject_id
    JOIN auth_credentials c ON c.credential_id = i.credential_id AND c.auth_subject_id = i.auth_subject_id
    WHERE i.provider = ${provider} AND i.issuer = ${issuer} AND i.subject = ${subject}`,
    ),
})
