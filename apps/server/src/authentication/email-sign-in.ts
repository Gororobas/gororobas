import { AuthSecurityRevision, AuthSubjectId, IdGen, TimestampColumn } from "@gororobas/domain"
import {
  Email,
  Identity,
  Schema as AuthSchema,
  Sessions,
  type Email as EmailTypes,
} from "@yielded/auth"
import { DateTime, Effect, Layer, Option, Schema } from "effect"
import { SqlClient, SqlSchema } from "effect/sql"

import { authenticationRequirement } from "./auth-storage.js"

export const emailCredentialId = (authSubjectId: string) => `email:${authSubjectId}`

const EmailAccount = Schema.Struct({
  id: AuthSubjectId,
  active: Schema.BooleanFromBit,
  securityRevision: AuthSecurityRevision,
  createdAt: TimestampColumn,
  credentialRevision: Schema.NullOr(AuthSecurityRevision),
  credentialActive: Schema.NullOr(Schema.BooleanFromBit),
})

const findEmailAccount = SqlSchema.findOneOption({
  Request: Schema.String,
  Result: EmailAccount,
  execute: (email) =>
    SqlClient.SqlClient.use(
      (sql) => sql`
        SELECT s.id, s.active, s.security_revision, s.created_at,
          c.revision AS credential_revision, c.active AS credential_active
        FROM auth_subjects s
        LEFT JOIN auth_credentials c ON c.credential_id = 'email:' || s.id
        WHERE s.email = ${email}`,
    ),
})

const reserveUnclaimedAccount = SqlSchema.void({
  Request: Schema.Struct({
    id: AuthSubjectId,
    email: Schema.String,
    securityRevision: AuthSecurityRevision,
    createdAt: TimestampColumn,
  }),
  execute: ({ id, email, securityRevision, createdAt }) =>
    SqlClient.SqlClient.use(
      (sql) => sql`
        INSERT INTO auth_subjects ${sql.insert({
          id,
          email,
          isEmailVerified: 0,
          active: 1,
          securityRevision,
          claimedAt: null,
          createdAt,
          updatedAt: createdAt,
        })}
        ON CONFLICT (email) DO NOTHING`,
    ),
})

const insertEmailCredential = SqlSchema.void({
  Request: Schema.Struct({ authSubjectId: AuthSubjectId, revision: AuthSecurityRevision }),
  execute: ({ authSubjectId, revision }) =>
    SqlClient.SqlClient.use(
      (sql) => sql`
        INSERT INTO auth_credentials ${sql.insert({
          credentialId: emailCredentialId(authSubjectId),
          authSubjectId,
          revision,
          active: 1,
        })}
        ON CONFLICT (credential_id) DO NOTHING`,
    ),
})

/**
 * Signing in and signing up are the same flow. Yielded's email sign-in never sends a code to an
 * address without an account, so an unknown address reserves an unclaimed account here. The first
 * redeemed code claims it (see `claimEmailAccount`); `deleteUnclaimedAccounts` removes the rest.
 *
 * Accounts created elsewhere (migration, tests) get their email credential lazily on first use.
 */
const findOrReserveEmailAccount = Effect.fn("Authentication.findOrReserveEmailAccount")(function* (
  email: string,
) {
  const sql = yield* SqlClient.SqlClient

  return yield* sql.withTransaction(
    Effect.gen(function* () {
      const existing = yield* findEmailAccount(email)

      if (Option.isNone(existing)) {
        yield* reserveUnclaimedAccount({
          id: yield* IdGen.make(AuthSubjectId),
          email,
          securityRevision: yield* IdGen.make(AuthSecurityRevision),
          createdAt: yield* DateTime.now,
        })
      }

      const account = Option.isSome(existing) ? existing : yield* findEmailAccount(email)
      if (Option.isNone(account) || account.value.credentialRevision !== null) return account

      yield* insertEmailCredential({
        authSubjectId: account.value.id,
        revision: yield* IdGen.make(AuthSecurityRevision),
      })
      return yield* findEmailAccount(email)
    }),
  )
})

export const EmailSignInTargetsLive = Layer.effect(
  Email.EmailSignInTargets,
  Effect.gen(function* () {
    const services = yield* Effect.context<SqlClient.SqlClient | IdGen>()

    return Email.EmailSignInTargets.of({
      lookup: Effect.fn("Authentication.lookupEmail")(
        function* ({ moduleId, identifier }) {
          const account = yield* findOrReserveEmailAccount(identifier.value)

          if (
            Option.isNone(account) ||
            !account.value.active ||
            account.value.credentialRevision === null ||
            account.value.credentialActive !== true
          ) {
            return Option.none()
          }

          const { id, securityRevision, credentialRevision, createdAt } = account.value
          const credentialId = emailCredentialId(id)

          return Option.some<EmailTypes.EmailCredentialSnapshot>({
            requirement: authenticationRequirement,
            moduleId,
            identifier: Identity.LoginIdentifier.make(identifier),
            identifierRevision: Sessions.SecurityRevision.make(securityRevision),
            verifiedAtMillis: DateTime.toEpochMillis(createdAt),
            credentialId,
            credentialRevision: Sessions.SecurityRevision.make(credentialRevision),
            revision: {
              subjectId: AuthSchema.SubjectId.make(id),
              securityRevision: Sessions.SecurityRevision.make(securityRevision),
              credentials: [
                { credentialId, revision: Sessions.SecurityRevision.make(credentialRevision) },
              ],
            },
          })
        },
        (effect) => effect.pipe(Effect.provide(services)),
        Effect.mapError(() => Email.EmailUnavailable.make({})),
      ),
    })
  }),
)

const markEmailAccountClaimed = SqlSchema.void({
  Request: Schema.Struct({ id: AuthSubjectId, claimedAt: TimestampColumn }),
  execute: ({ id, claimedAt }) =>
    SqlClient.SqlClient.use(
      (sql) => sql`
        UPDATE auth_subjects
        SET is_email_verified = 1, claimed_at = COALESCE(claimed_at, ${claimedAt}), updated_at = ${claimedAt}
        WHERE id = ${id}`,
    ),
})

/**
 * Yielded resolves claims only after redeeming the emailed proof, so this is where mailbox
 * ownership is established: it verifies the email and claims pending sign-ups.
 */
export const claimEmailAccount = Effect.fn("Authentication.claimEmailAccount")(function* (
  subjectId: AuthSchema.SubjectId,
) {
  yield* markEmailAccountClaimed({
    id: AuthSubjectId.make(subjectId),
    claimedAt: yield* DateTime.now,
  })
  return {}
})
