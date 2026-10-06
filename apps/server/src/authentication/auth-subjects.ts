import {
  AuthSubjectId,
  AuthSecurityRevision,
  IdGen,
  Email,
  MagicLinkIdentity,
} from "@gororobas/domain"
import { Sessions } from "@yielded/auth"
import { DateTime, Effect, Option, Schema } from "effect"
import { SqlClient } from "effect/sql"

import {
  insertAuthSubject,
  insertPerson,
  insertPersonProfile,
  upsertMagicLinkCredential,
  verifyAccountEmail,
} from "./mutations.js"
import { findAccountSecurityByEmail } from "./queries.js"

export const provisionMagicLinkAccount = Effect.fn("Authentication.provisionAccount")(function* (
  input: Pick<typeof MagicLinkIdentity.Type, "email" | "name">,
) {
  const email = yield* Schema.decodeEffect(Email)(input.email).pipe(
    Effect.mapError(() => Sessions.SessionUnavailable.make({})),
  )
  const sql = yield* SqlClient.SqlClient

  return yield* sql
    .withTransaction(
      Effect.gen(function* () {
        const existing = yield* findAccountSecurityByEmail(email)

        if (Option.isSome(existing)) {
          if (!existing.value.active) return yield* Sessions.StaleAuthentication.make({})

          yield* verifyAccountEmail(existing.value.id)
          yield* upsertMagicLinkCredential({
            authSubjectId: existing.value.id,
            revision: existing.value.securityRevision,
          })
          return existing.value.id
        }

        const id = yield* IdGen.make(AuthSubjectId)
        const now = yield* DateTime.now
        const revision = yield* IdGen.make(AuthSecurityRevision)

        yield* insertAuthSubject({
          id,
          name: input.name,
          email,
          isEmailVerified: true,
          image: null,
          active: true,
          securityRevision: revision,
          createdAt: now,
          updatedAt: now,
        })

        yield* insertPersonProfile({ id, name: input.name, createdAt: now, updatedAt: now })
        yield* insertPerson(id)
        yield* upsertMagicLinkCredential({ authSubjectId: id, revision })
        return id
      }),
    )
    .pipe(
      Effect.mapError((error) =>
        Schema.is(Sessions.StaleAuthentication)(error)
          ? error
          : Sessions.SessionUnavailable.make({}),
      ),
    )
})
