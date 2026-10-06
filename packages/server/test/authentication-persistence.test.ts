import { it } from "@effect/vitest"
import { AuthSubjectId, MagicLinkIdentity, OAuthProvider } from "@gororobas/domain"
import { assertPropertyEffect } from "@gororobas/domain/testing"
import { Schema as AuthSchema } from "@yielded/auth"
import { DateTime, Effect, Schema } from "effect"
import * as Arbitrary from "effect/Arbitrary"
import { SqlClient } from "effect/sql"

import { provisionMagicLinkAccount } from "../src/authentication/auth-subjects.js"
import { consumeOAuthFlow, insertOAuthFlow } from "../src/authentication/mutations.js"
import { provisionOAuthAccount } from "../src/authentication/oauth-storage.js"
import { DATABASE_PROPERTY_TEST_CONFIG, TestLayer } from "./test-helpers.js"

const signupArbitrary = Arbitrary.schema(
  Schema.Struct({
    identifier: AuthSubjectId,
    name: MagicLinkIdentity.fields.name,
    otherName: MagicLinkIdentity.fields.name,
    provider: OAuthProvider,
    oauthFirst: Schema.Boolean,
  }),
)

it.effect("both signup orders converge on one subject only through explicit OAuth linking", () =>
  assertPropertyEffect(
    signupArbitrary,
    (input) =>
      Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient
        const email = yield* Schema.decodeEffect(AuthSchema.Email)(
          `${input.identifier}@example.com`,
        )
        const identity = {
          issuer: "https://provider.example",
          subject: input.identifier,
          email,
          emailVerified: true,
          name: input.name,
        }
        const signup = { provider: input.provider, identity, linkAuthSubjectId: null }
        const authSubjectId = input.oauthFirst
          ? (yield* provisionOAuthAccount(signup)).authSubjectId
          : yield* provisionMagicLinkAccount({ email, name: input.name })

        if (!input.oauthFirst) {
          const implicitLink = yield* provisionOAuthAccount(signup).pipe(Effect.result)
          if (implicitLink._tag !== "Failure" || implicitLink.failure.reason !== "account-conflict")
            return false
          const linked = yield* provisionOAuthAccount({
            ...signup,
            linkAuthSubjectId: authSubjectId,
          })
          if (linked.authSubjectId !== authSubjectId) return false
        }

        const magicLinkSubject = yield* provisionMagicLinkAccount({ email, name: input.otherName })
        const returning = yield* provisionOAuthAccount({
          ...signup,
          identity: { ...identity, email: "changed@example.com", emailVerified: false },
        })
        const subjects = yield* sql`SELECT id, name FROM auth_subjects`
        const people = yield* sql`SELECT id, access_level FROM people`
        const profiles = yield* sql`SELECT id, name FROM profiles`
        const credentials = yield* sql`SELECT auth_subject_id FROM auth_credentials`
        const identities = yield* sql`SELECT auth_subject_id FROM auth_oauth_identities`
        return (
          magicLinkSubject === authSubjectId &&
          returning.authSubjectId === authSubjectId &&
          subjects.length === 1 &&
          subjects[0]?.id === authSubjectId &&
          subjects[0]?.name === input.name &&
          profiles.length === 1 &&
          profiles[0]?.id === authSubjectId &&
          profiles[0]?.name === input.name &&
          people.length === 1 &&
          people[0]?.id === authSubjectId &&
          people[0]?.accessLevel === "NEWCOMER" &&
          credentials.length === 2 &&
          credentials.every((row) => row.authSubjectId === authSubjectId) &&
          identities.length === 1 &&
          identities[0]?.authSubjectId === authSubjectId
        )
      }).pipe(Effect.provide(TestLayer)),
    DATABASE_PROPERTY_TEST_CONFIG,
  ),
)

it.effect("only the exact unexpired OAuth binding can consume a flow, and only once", () =>
  assertPropertyEffect(
    Arbitrary.schema(
      Schema.Struct({
        state: Schema.NonEmptyString.check(Schema.isMaxLength(128)),
        flowId: Schema.NonEmptyString.check(Schema.isMaxLength(128)),
        bindingVerifier: Schema.NonEmptyString.check(Schema.isMaxLength(128)),
        provider: OAuthProvider,
        mismatch: Schema.Literals(["state", "flowId", "bindingVerifier", "provider", "expiry"]),
      }),
    ),
    (input) =>
      Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient
        const request = {
          state: input.state,
          flowId: input.flowId,
          bindingVerifier: input.bindingVerifier,
          provider: input.provider,
        }
        yield* insertOAuthFlow({
          ...request,
          nonce: "nonce",
          pkceVerifier: "pkce",
          linkAuthSubjectId: null,
          expiresAt:
            input.mismatch === "expiry" ? 0 : DateTime.toEpochMillis(yield* DateTime.now) + 600_000,
        })
        const mismatch = {
          ...request,
          ...(input.mismatch === "provider"
            ? {
                provider: input.provider === "google" ? ("apple" as const) : ("google" as const),
              }
            : input.mismatch === "expiry"
              ? {}
              : {
                  [input.mismatch]: request[input.mismatch] + ":other",
                }),
        }
        const rejected = yield* consumeOAuthFlow(mismatch)
        const retained = yield* sql`SELECT state FROM auth_oauth_flows`
        const consumed = yield* consumeOAuthFlow(request)
        const replay = yield* consumeOAuthFlow(request)
        return (
          rejected._tag === "None" &&
          retained.length === 1 &&
          consumed._tag === (input.mismatch === "expiry" ? "None" : "Some") &&
          replay._tag === "None"
        )
      }).pipe(Effect.provide(TestLayer)),
    DATABASE_PROPERTY_TEST_CONFIG,
  ),
)

it.effect("a failed profile write rolls back signup through either authentication method", () =>
  assertPropertyEffect(
    signupArbitrary,
    (input) =>
      Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient
        const email = yield* Schema.decodeEffect(AuthSchema.Email)(
          `${input.identifier}@example.com`,
        )
        yield* sql`CREATE TRIGGER reject_profile BEFORE INSERT ON profiles BEGIN SELECT RAISE(ABORT, 'profile failure'); END`
        const result = input.oauthFirst
          ? yield* provisionOAuthAccount({
              provider: input.provider,
              identity: {
                issuer: "https://provider.example",
                subject: input.identifier,
                email,
                emailVerified: true,
                name: input.name,
              },
              linkAuthSubjectId: null,
            }).pipe(Effect.result)
          : yield* provisionMagicLinkAccount({ email, name: input.name }).pipe(Effect.result)
        const subjects = yield* sql`SELECT id FROM auth_subjects`
        const profiles = yield* sql`SELECT id FROM profiles`
        const people = yield* sql`SELECT id FROM people`
        const credentials = yield* sql`SELECT credential_id FROM auth_credentials`
        const identities = yield* sql`SELECT subject FROM auth_oauth_identities`
        return (
          result._tag === "Failure" &&
          [subjects, profiles, people, credentials, identities].every((rows) => rows.length === 0)
        )
      }).pipe(Effect.provide(TestLayer)),
    DATABASE_PROPERTY_TEST_CONFIG,
  ),
)
