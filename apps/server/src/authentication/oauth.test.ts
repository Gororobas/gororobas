import { expect, it as test } from "@effect/vitest"
import { AuthenticationApi, AuthSecurityRevision, AuthSubjectId } from "@gororobas/domain"
import { Proofs } from "@yielded/auth"
import { Context, Effect, Layer, ManagedRuntime, Redacted, Schema, Predicate } from "effect"
import { HttpRouter } from "effect/http"
import { SqlClient } from "effect/sql"

import {
  authenticationTestOrigin as origin,
  authenticationTestBindingKey,
  AuthenticationTestInfrastructure,
  captureEmailDelivery,
  makeAuthenticationTestBrowser,
} from "../../test/authentication-helpers.js"
import { authenticationLayer } from "./authentication-live.js"
import { OAuthProtocol } from "./oauth-protocol.js"
const authorization = Schema.Struct({
  _tag: Schema.Literal("Success"),
  value: Schema.Struct({
    authorizationUrl: Schema.String,
  }),
})

const completion = Schema.Struct({
  _tag: Schema.Literal("Success"),
  value: AuthenticationApi.actions.completeOAuth.route.operation.rpc.successSchema,
})

test.live(
  "OAuth binds and consumes flows, relays Apple POSTs, and connects identities without email-based account linking",
  Effect.fn(function* () {
    let exchanges = 0
    let subjectSuffix = ""
    let email = "provider@example.com"

    const protocol = Layer.succeed(OAuthProtocol, {
      authorize: (input) =>
        Effect.succeed(
          `https://provider.example/authorize?state=${input.state}&nonce=${input.nonce}`,
        ),
      exchange: (input) =>
        Effect.sync(() => {
          exchanges++

          return {
            issuer: `https://${input.provider}.example`,
            subject: `${input.provider}-subject${subjectSuffix}`,
            email,
            isEmailVerified: input.provider !== "microsoft",
            name: "Provider Person",
          }
        }),
    })

    const runtime = yield* Effect.acquireRelease(
      Effect.sync(() => ManagedRuntime.make(AuthenticationTestInfrastructure)),
      (resource) => Effect.orDie(Effect.tryPromise(() => resource.dispose())),
    )
    const runtimeContext = yield* runtime.contextEffect
    const { layer: deliveryLayer } = captureEmailDelivery()

    const routes = authenticationLayer({
      origin,
      requestBindingKey: authenticationTestBindingKey,
      oauthProtocol: protocol,
    }).pipe(
      Layer.provide(deliveryLayer),
      Layer.provide(Layer.succeedContext(yield* runtime.contextEffect)),
    )

    const app = yield* Effect.acquireRelease(
      Effect.sync(() =>
        HttpRouter.toWebHandler(routes, {
          disableLogger: true,
        }),
      ),
      (resource) => Effect.orDie(Effect.tryPromise(() => resource.dispose())),
    )

    const context = Context.make(
      Proofs.ProofRequestContext,
      Effect.succeed({
        networkKey: Redacted.make("127.0.0.1"),
      }),
    )

    const { fetchRoute, cookieHeader } = makeAuthenticationTestBrowser((request) =>
      app.handler(request, context),
    )

    const request = Effect.fn(function* ({
      path,
      payload,
      cookie = cookieHeader(),
    }: {
      path: string
      payload?: unknown
      cookie?: string | undefined
    }) {
      return yield* fetchRoute({
        path: path,
        method: payload === undefined ? "GET" : "POST",
        body:
          payload === undefined
            ? undefined
            : {
                payload,
              },
        customHeaders: {
          cookie,
        },
      })
    })

    const begin = Effect.fn(function* (provider: "apple" | "google" | "microsoft") {
      const flowId = crypto.randomUUID()

      const response = yield* request({
        path: "/api/auth/beginOAuth",
        payload: {
          provider,
          flowId,
        },
      })

      expect(response.status).toBe(200)
      // oxlint-disable-next-line custom-lint-rules/no-schema-decode-unknown -- HTTP response JSON has not yet been validated against its response schema.
      const result = Schema.decodeUnknownSync(authorization)(
        yield* Effect.tryPromise(() => response.json()),
      )
      const state = new URL(result.value.authorizationUrl).searchParams.get("state")
      if (state === null) return yield* Effect.die("missing state")

      return {
        provider,
        flowId,
        state,
        code: "approved-code",
      }
    })

    const finish = Effect.fn(function* (input: Effect.Success<ReturnType<typeof begin>>) {
      const response = yield* request({
        path: "/api/auth/completeOAuth",
        payload: input,
      })
      expect(response.status).toBe(200)
      // oxlint-disable-next-line custom-lint-rules/no-schema-decode-unknown -- HTTP response JSON has not yet been validated against its response schema.
      const value = Schema.decodeUnknownSync(completion)(
        yield* Effect.tryPromise(() => response.json()),
      ).value
      if (!Predicate.isTagged(value, "Authenticated")) return yield* Effect.die("missing session")
      return value.session.subjectId
    })

    const query = <A extends object>(
      execute: (sql: SqlClient.SqlClient) => Effect.Effect<ReadonlyArray<A>, unknown>,
    ) => Effect.flatMap(SqlClient.SqlClient, execute).pipe(Effect.provide(runtimeContext))
    const google = yield* begin("google")

    expect(
      (yield* request({
        path: "/api/auth/completeOAuth",
        payload: google,
        cookie: "",
      })).status,
    ).not.toBe(200)

    expect(
      (yield* request({
        path: "/api/auth/completeOAuth",
        payload: {
          ...google,
          state: "wrong",
        },
      })).status,
    ).not.toBe(200)

    expect(
      (yield* request({
        path: "/api/auth/completeOAuth",
        payload: {
          ...google,
          provider: "apple",
        },
      })).status,
    ).not.toBe(200)

    expect(exchanges).toBe(0)
    const authSubjectId = yield* finish(google)

    expect(
      (yield* request({
        path: "/api/auth/completeOAuth",
        payload: google,
      })).status,
    ).not.toBe(200)

    expect(exchanges).toBe(1)
    const rows = yield* query((sql) => sql`SELECT id, security_revision FROM auth_subjects`)
    expect(rows).toHaveLength(1)

    // oxlint-disable-next-line custom-lint-rules/no-schema-decode-unknown -- Raw SQL rows have no statically known selected columns.
    Schema.decodeUnknownSync(
      Schema.Array(
        Schema.Struct({
          id: AuthSubjectId,
          securityRevision: AuthSecurityRevision,
        }),
      ),
    )(rows)

    const lostSession = yield* begin("microsoft")
    yield* request({
      path: "/api/auth/signOut",
      payload: {},
    })

    expect(
      (yield* request({
        path: "/api/auth/completeOAuth",
        payload: lostSession,
      })).status,
    ).not.toBe(200)

    expect(exchanges).toBe(1)
    subjectSuffix = "-unverified"

    const unverified = yield* Effect.gen(function* () {
      const response1 = yield* begin("microsoft")
      return yield* request({
        path: "/api/auth/completeOAuth",
        payload: response1,
      })
    })

    expect(unverified.status).not.toBe(200)
    expect(yield* Effect.tryPromise(() => unverified.text())).toContain(
      "email-verification-required",
    )
    subjectSuffix = ""

    expect(
      yield* Effect.gen(function* () {
        const response2 = yield* begin("google")
        return yield* finish(response2)
      }),
    ).toBe(authSubjectId)

    const microsoft = yield* begin("microsoft")
    expect(yield* finish(microsoft)).toBe(authSubjectId)
    yield* request({
      path: "/api/auth/signOut",
      payload: {},
    })

    expect(
      yield* Effect.gen(function* () {
        const response3 = yield* begin("microsoft")
        return yield* finish(response3)
      }),
    ).toBe(authSubjectId)

    yield* request({
      path: "/api/auth/signOut",
      payload: {},
    })
    const apple = yield* begin("apple")

    const relay = yield* Effect.tryPromise(() =>
      app.handler(
        new Request(`${origin}/api/auth/apple/callback`, {
          method: "POST",
          headers: {
            "content-type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({
            state: apple.state,
            code: apple.code,
          }),
        }),
        context,
      ),
    )

    expect(relay.status).toBe(303)
    expect(relay.headers.get("location")).toContain("#oauth=")
    expect(exchanges).toBe(5)
    // An existing email cannot silently acquire a new external login.
    const conflict = yield* request({
      path: "/api/auth/completeOAuth",
      payload: apple,
    })
    expect(conflict.status).not.toBe(200)
    expect(yield* Effect.tryPromise(() => conflict.text())).toContain("account-conflict")
    expect(yield* query((sql) => sql`SELECT id FROM auth_subjects`)).toHaveLength(1)
    email = "apple@example.com"
    const appleAuthSubjectId = yield* Effect.gen(function* () {
      const response4 = yield* begin("apple")
      return yield* finish(response4)
    })
    expect(appleAuthSubjectId).not.toBe(authSubjectId)
    yield* request({
      path: "/api/auth/signOut",
      payload: {},
    })
    // Expired flows never exchange a code or establish a session.
    const expired = yield* begin("google")
    yield* query(
      (sql) => sql`UPDATE auth_oauth_flows SET expires_at = 0 WHERE state = ${expired.state}`,
    )
    const beforeExpiry = exchanges

    expect(
      (yield* request({
        path: "/api/auth/completeOAuth",
        payload: expired,
      })).status,
    ).not.toBe(200)

    expect(exchanges).toBe(beforeExpiry)
    yield* query(
      (sql) => sql`UPDATE auth_credentials SET active = 0 WHERE auth_subject_id = ${authSubjectId}`,
    )

    const revoked = yield* Effect.gen(function* () {
      const response5 = yield* begin("microsoft")
      return yield* request({
        path: "/api/auth/completeOAuth",
        payload: response5,
      })
    })

    expect(revoked.status).not.toBe(200)
    expect(yield* Effect.tryPromise(() => revoked.text())).toContain("account-conflict")
    expect(yield* query((sql) => sql`SELECT id FROM auth_subjects`)).toHaveLength(2)
  }),
)
