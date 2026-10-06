import { AuthSecurityRevision, AuthSubjectId, AccountRow, OAuthProvider } from "@gororobas/domain"
import { DateTime, Effect, Schema } from "effect"
import { SqlClient, SqlSchema } from "effect/sql"

import { OAuthFlow } from "./oauth-domain.js"

export const verifyAccountEmail = SqlSchema.void({
  Request: AuthSubjectId,
  execute: (id) =>
    SqlClient.SqlClient.use(
      (sql) => sql`UPDATE auth_subjects SET is_email_verified = 1 WHERE id = ${id}`,
    ),
})

export const upsertMagicLinkCredential = SqlSchema.void({
  Request: Schema.Struct({ authSubjectId: AuthSubjectId, revision: AuthSecurityRevision }),
  execute: ({ authSubjectId, revision }) =>
    SqlClient.SqlClient.use(
      (sql) =>
        sql`INSERT INTO auth_credentials ${sql.insert({
          credentialId: authSubjectId,
          authSubjectId,
          revision,
          active: 1,
        })} ON CONFLICT (credential_id) DO UPDATE SET revision = excluded.revision`,
    ),
})

export const insertAuthSubject = SqlSchema.void({
  Request: Schema.Struct({
    ...AccountRow.fields,
    isEmailVerified: Schema.BooleanFromBit,
    active: Schema.BooleanFromBit,
    securityRevision: AuthSecurityRevision,
  }),
  execute: (row) =>
    SqlClient.SqlClient.use((sql) => sql`INSERT INTO auth_subjects ${sql.insert(row)}`),
})

export const insertPersonProfile = SqlSchema.void({
  Request: Schema.Struct({
    id: AuthSubjectId,
    name: Schema.String,
    createdAt: AccountRow.fields.createdAt,
    updatedAt: AccountRow.fields.updatedAt,
  }),
  execute: (row) =>
    SqlClient.SqlClient.use(
      (sql) =>
        sql`INSERT INTO profiles ${sql.insert({
          ...row,
          type: "PERSON",
          handle: `person-${row.id}`,
          visibility: "PUBLIC",
        })}`,
    ),
})

export const insertPerson = SqlSchema.void({
  Request: AuthSubjectId,
  execute: (id) =>
    SqlClient.SqlClient.use(
      (sql) => sql`INSERT INTO people ${sql.insert({ id, accessLevel: "NEWCOMER" })}`,
    ),
})

export const insertOAuthFlow = SqlSchema.void({
  Request: OAuthFlow,
  execute: (row) =>
    SqlClient.SqlClient.use((sql) =>
      sql.withTransaction(
        Effect.gen(function* () {
          const now = DateTime.toEpochMillis(yield* DateTime.now)
          yield* sql`DELETE FROM auth_oauth_flows WHERE expires_at <= ${now}`
          yield* sql`INSERT INTO auth_oauth_flows ${sql.insert(row)}`
        }),
      ),
    ),
})

export const consumeOAuthFlow = SqlSchema.findOneOption({
  Request: Schema.Struct({
    state: Schema.String,
    provider: OAuthProvider,
    flowId: Schema.String,
    bindingVerifier: Schema.String,
  }),
  Result: OAuthFlow,
  execute: ({ state, provider, flowId, bindingVerifier }) =>
    SqlClient.SqlClient.use((sql) =>
      Effect.gen(function* () {
        const now = DateTime.toEpochMillis(yield* DateTime.now)
        return yield* sql`DELETE FROM auth_oauth_flows WHERE state = ${state} AND provider = ${provider} AND flow_id = ${flowId} AND binding_verifier = ${bindingVerifier} AND expires_at > ${now} RETURNING *`
      }),
    ),
})

export const insertOAuthCredential = SqlSchema.void({
  Request: Schema.Struct({
    credentialId: Schema.String,
    authSubjectId: AuthSubjectId,
    revision: AuthSecurityRevision,
  }),
  execute: (row) =>
    SqlClient.SqlClient.use(
      (sql) => sql`INSERT INTO auth_credentials ${sql.insert({ ...row, active: 1 })}`,
    ),
})

export const insertOAuthIdentity = SqlSchema.void({
  Request: Schema.Struct({
    provider: OAuthProvider,
    issuer: Schema.String,
    subject: Schema.String,
    authSubjectId: AuthSubjectId,
    credentialId: Schema.String,
  }),
  execute: (row) =>
    SqlClient.SqlClient.use((sql) => sql`INSERT INTO auth_oauth_identities ${sql.insert(row)}`),
})
