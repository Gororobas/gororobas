import {
  AuthSecurityRevision,
  AuthSubjectId,
  Email,
  IdGen,
  OAuthLoginRejected,
  OAuthProvider,
} from "@gororobas/domain"
import { DateTime, Effect, Option, Schema, Predicate } from "effect"
import { SqlClient } from "effect/sql"

import {
  insertAuthSubject,
  insertOAuthCredential,
  insertOAuthIdentity,
  insertPerson,
  insertPersonProfile,
} from "./mutations.js"
import { OAuthIdentity } from "./oauth-protocol.js"
import { findAccountSecurityByEmail, findOAuthIdentity } from "./queries.js"
export const provisionOAuthAccount = Effect.fn("Authentication.provisionOAuthAccount")(
  function* (input: {
    readonly provider: typeof OAuthProvider.Type
    readonly identity: typeof OAuthIdentity.Type
    readonly linkAuthSubjectId: AuthSubjectId | null
  }) {
    const sql = yield* SqlClient.SqlClient

    return yield* sql
      .withTransaction(
        Effect.gen(function* () {
          const key = {
            provider: input.provider,
            issuer: input.identity.issuer,
            subject: input.identity.subject,
          }

          const existing = yield* findOAuthIdentity(key)

          if (Option.isSome(existing)) {
            if (
              !existing.value.active ||
              !existing.value.credentialActive ||
              (input.linkAuthSubjectId !== null &&
                input.linkAuthSubjectId !== existing.value.authSubjectId)
            ) {
              return yield* OAuthLoginRejected.make({
                reason: "account-conflict",
              })
            }

            return existing.value
          }

          let authSubjectId = input.linkAuthSubjectId

          if (authSubjectId === null) {
            if (!input.identity.isEmailVerified || input.identity.email === undefined) {
              return yield* OAuthLoginRejected.make({
                reason: "email-verification-required",
              })
            }

            const email = yield* Schema.decodeEffect(Email)(input.identity.email).pipe(
              Effect.mapError(() =>
                OAuthLoginRejected.make({
                  reason: "email-verification-required",
                }),
              ),
            )

            // Matching email is not consent to connect an external identity to an account.
            if (Predicate.isTagged(yield* findAccountSecurityByEmail(email), "Some")) {
              return yield* OAuthLoginRejected.make({
                reason: "account-conflict",
              })
            }

            authSubjectId = yield* IdGen.make(AuthSubjectId)
            const now = yield* DateTime.now

            yield* insertAuthSubject({
              id: authSubjectId,
              email,
              name: input.identity.name,
              isEmailVerified: true,
              image: null,
              active: true,
              securityRevision: yield* IdGen.make(AuthSecurityRevision),
              createdAt: now,
              updatedAt: now,
            })

            yield* insertPersonProfile({
              id: authSubjectId,
              name: input.identity.name,
              createdAt: now,
              updatedAt: now,
            })

            yield* insertPerson(authSubjectId)
          }

          const credentialId = `oauth:${(yield* IdGen).generate()}`
          const revision = yield* IdGen.make(AuthSecurityRevision)

          yield* insertOAuthCredential({
            credentialId,
            authSubjectId,
            revision,
          })

          yield* insertOAuthIdentity({
            ...key,
            authSubjectId,
            credentialId,
          })

          return {
            authSubjectId,
            credentialId,
          }
        }),
      )
      .pipe(
        Effect.mapError((error) =>
          Schema.is(OAuthLoginRejected)(error)
            ? error
            : OAuthLoginRejected.make({
                reason: "invalid-flow",
              }),
        ),
      )
  },
)
