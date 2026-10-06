import { expect, it as test } from "@effect/vitest"
import { AuthenticationApi, AuthenticationHttp, SessionContext } from "@gororobas/domain"
import { Proofs } from "@yielded/auth"
import { Context, Effect, Layer, ManagedRuntime, Redacted, Schema, Predicate } from "effect"
import { HttpRouter } from "effect/http"
import { HttpApi, HttpApiBuilder, HttpApiEndpoint, HttpApiGroup } from "effect/http-api"
import { SqlClient } from "effect/sql"

import {
  authenticationTestOrigin as origin,
  authenticationTestBindingKey,
  AuthenticationTestInfrastructure,
  captureEmailDelivery,
  makeAuthenticationTestBrowser,
  parseDeliveredMagicLink,
} from "../../test/authentication-helpers.js"
import { SessionServiceLive } from "../session-service.js"
import { makeAuthentication } from "./app-auth.js"
import { authenticationLayer } from "./authentication-live.js"
const ProtectedApi = HttpApi.make("test/authentication").add(
  HttpApiGroup.make("protected")
    .add(
      HttpApiEndpoint.get("account", "/protected", {
        success: Schema.Struct({
          authSubjectId: Schema.String,
          accessLevel: Schema.String,
        }),
      }),
    )
    .middleware(AuthenticationHttp.RequireSession),
)

const ProtectedHandlers = HttpApiBuilder.group(ProtectedApi, "protected", (handlers) =>
  handlers.handle("account", () =>
    Effect.gen(function* () {
      const authentication = yield* AuthenticationHttp.CurrentSession
      const session = yield* SessionContext
      if (authentication === null || session.type !== "ACCOUNT") {
        return yield* Effect.die("authenticated account missing")
      }
      return {
        authSubjectId: authentication.subjectId,
        accessLevel: session.accessLevel,
      }
    }).pipe(Effect.provide(SessionServiceLive), Effect.orDie),
  ),
)

test.live(
  "HTTP vertical slice: magic-link signup, protected access, sign-out and existing-account sign-in",
  Effect.fn(function* () {
    const runtime = yield* Effect.acquireRelease(
      Effect.sync(() => ManagedRuntime.make(AuthenticationTestInfrastructure)),
      (resource) => Effect.orDie(Effect.tryPromise(() => resource.dispose())),
    )
    const runtimeContext = yield* runtime.contextEffect
    const database = Layer.succeedContext(yield* runtime.contextEffect)
    const { deliveries, layer: deliveryLayer } = captureEmailDelivery()
    const authentication = authenticationLayer({
      origin,
      requestBindingKey: authenticationTestBindingKey,
    }).pipe(Layer.provide(deliveryLayer))
    const protectedRoutes = HttpApiBuilder.layer(ProtectedApi).pipe(
      Layer.provide(ProtectedHandlers),
      Layer.provide(authentication),
    )

    const routes = protectedRoutes.pipe(
      makeAuthentication(origin).http.middleware,
      Layer.provideMerge(authentication),
      Layer.provide(database),
    )

    const app = yield* Effect.acquireRelease(
      Effect.sync(() =>
        HttpRouter.toWebHandler(routes, {
          disableLogger: true,
        }),
      ),
      (resource) => Effect.orDie(Effect.tryPromise(() => resource.dispose())),
    )

    const requestContext = Context.add(
      yield* runtime.contextEffect,
      Proofs.ProofRequestContext,
      Effect.succeed({
        networkKey: Redacted.make("127.0.0.1"),
      }),
    )

    const { fetchRoute, call, cookieHeader } = makeAuthenticationTestBrowser((request) =>
      app.handler(request, requestContext),
    )

    const identity = {
      flowId: "signup-flow",
      email: "person@example.com",
      name: "Agroecology Person",
    }

    const query = <A extends object>(
      statement: (sql: SqlClient.SqlClient) => Effect.Effect<ReadonlyArray<A>, unknown>,
    ) => Effect.flatMap(SqlClient.SqlClient, statement).pipe(Effect.provide(runtimeContext))

    expect(
      (yield* fetchRoute({
        path: "/protected",
      })).status,
    ).toBe(401)

    const noCsrf = yield* fetchRoute({
      path: "/api/auth/beginMagicLink",
      method: "POST",
      body: {
        payload: {
          flowId: "csrf",
        },
      },
      customHeaders: {
        "x-effect-auth-csrf": "",
      },
    })

    expect(noCsrf.status).not.toBe(200)

    const wrongOrigin = yield* fetchRoute({
      path: "/api/auth/beginMagicLink",
      method: "POST",
      body: {
        payload: {
          flowId: "origin",
        },
      },
      customHeaders: {
        origin: "https://evil.example",
      },
    })

    expect(wrongOrigin.status).not.toBe(200)
    yield* call(AuthenticationApi.actions.beginMagicLink, {
      flowId: identity.flowId,
    })

    const receipt = yield* call(AuthenticationApi.actions.requestMagicLink, {
      ...identity,
      requestId: "signup-request",
      locale: "en",
    })

    yield* call(AuthenticationApi.actions.requestMagicLink, {
      ...identity,
      requestId: "signup-request",
      locale: "en",
    })

    yield* Effect.tryPromise(async () => await expect.poll(() => deliveries.length).toBe(1))
    expect(yield* query((sql) => sql`SELECT id FROM auth_subjects`)).toHaveLength(0)
    const message = deliveries[0]
    if (message === undefined) return yield* Effect.die("missing email")
    expect(message.to).toBe(identity.email)
    const { link, proof } = yield* parseDeliveredMagicLink(message)
    expect(link.search).toBe("")
    const landing = yield* fetchRoute({
      path: link.pathname,
    })
    expect(landing.status).toBe(200)
    expect(landing.headers.get("cache-control")).toBe("no-store")
    expect(yield* query((sql) => sql`SELECT id FROM auth_subjects`)).toHaveLength(0)
    expect(proof.reference).toEqual(receipt.reference)

    const tampered = yield* fetchRoute({
      path: "/api/auth/verifyMagicLink",
      method: "POST",
      body: {
        payload: {
          ...identity,
          name: "Different Person",
          reference: proof.reference,
          secret: Redacted.value(proof.secret),
        },
      },
    })

    expect(tampered.status).not.toBe(200)

    const withoutBinding = yield* fetchRoute({
      path: "/api/auth/verifyMagicLink",
      method: "POST",
      body: {
        payload: {
          ...identity,
          reference: proof.reference,
          secret: Redacted.value(proof.secret),
        },
      },
      customHeaders: {
        cookie: "",
      },
    })

    expect(withoutBinding.status).not.toBe(200)

    const verified = yield* call(AuthenticationApi.actions.verifyMagicLink, {
      ...identity,
      reference: proof.reference,
      secret: Redacted.value(proof.secret),
    })

    const completed = yield* call(AuthenticationApi.actions.completeMagicLink, {
      ...identity,
      continuationId: verified.continuation.continuationId,
    })
    expect(completed._tag).toBe("Authenticated")
    if (!Predicate.isTagged(completed, "Authenticated")) return yield* Effect.die("session missing")
    const authSubjectId = completed.session.subjectId

    expect(
      yield* query(
        (sql) => sql`SELECT a.id, a.is_email_verified, p.type, pe.access_level
      FROM auth_subjects a JOIN profiles p ON p.id = a.id JOIN people pe ON pe.id = a.id`,
      ),
    ).toEqual([
      {
        id: authSubjectId,
        isEmailVerified: 1,
        type: "PERSON",
        accessLevel: "NEWCOMER",
      },
    ])

    const protectedResponse = yield* fetchRoute({
      path: "/protected",
    })
    expect(protectedResponse.status).toBe(200)
    expect(yield* Effect.tryPromise(() => protectedResponse.json())).toEqual({
      authSubjectId,
      accessLevel: "NEWCOMER",
    })
    expect((yield* call(AuthenticationApi.actions.getSession))?.subjectId).toBe(authSubjectId)
    yield* query(
      (sql) => sql`UPDATE people SET access_level = 'COMMUNITY' WHERE id = ${authSubjectId}`,
    )

    expect(
      yield* Effect.gen(function* () {
        const response0 = yield* fetchRoute({
          path: "/protected",
        })
        return yield* Effect.tryPromise(() => response0.json())
      }),
    ).toEqual({
      authSubjectId,
      accessLevel: "COMMUNITY",
    })

    const replay = yield* fetchRoute({
      path: "/api/auth/verifyMagicLink",
      method: "POST",
      body: {
        payload: {
          ...identity,
          reference: proof.reference,
          secret: Redacted.value(proof.secret),
        },
      },
    })

    expect(replay.status).not.toBe(200)

    const repeatCompletion = yield* fetchRoute({
      path: "/api/auth/completeMagicLink",
      method: "POST",
      body: {
        payload: {
          ...identity,
          continuationId: verified.continuation.continuationId,
        },
      },
    })

    expect(repeatCompletion.status).not.toBe(200)
    const previousCookies = cookieHeader()
    yield* query(
      (sql) =>
        sql`UPDATE auth_credentials SET revision = 'stale' WHERE auth_subject_id = ${authSubjectId}`,
    )
    yield* call(AuthenticationApi.actions.signOut)
    expect(yield* call(AuthenticationApi.actions.getSession)).toBeNull()

    expect(
      (yield* fetchRoute({
        path: "/protected",
        method: "GET",
        body: undefined,
        customHeaders: {
          cookie: previousCookies,
        },
      })).status,
    ).toBe(401)

    expect(yield* query((sql) => sql`SELECT session_id FROM auth_sessions`)).toHaveLength(0)
    // Move the stored cooldown into the past to simulate waiting between logins.
    yield* query((sql) => sql`UPDATE auth_proof_series SET last_issue_at = last_issue_at - 30001`)

    const login = {
      ...identity,
      flowId: "signin-flow",
      name: "Name must not overwrite existing profile",
    }

    yield* call(AuthenticationApi.actions.beginMagicLink, {
      flowId: login.flowId,
    })

    yield* call(AuthenticationApi.actions.requestMagicLink, {
      ...login,
      requestId: "signin-request",
      locale: "en",
    })

    yield* Effect.tryPromise(async () => await expect.poll(() => deliveries.length).toBe(2))
    const next = deliveries[1]
    if (next === undefined) return yield* Effect.die("missing sign-in email")
    const { proof: nextProof } = yield* parseDeliveredMagicLink(next)

    const signInVerified = yield* call(AuthenticationApi.actions.verifyMagicLink, {
      ...login,
      reference: nextProof.reference,
      secret: Redacted.value(nextProof.secret),
    })

    const signedIn = yield* call(AuthenticationApi.actions.completeMagicLink, {
      ...login,
      continuationId: signInVerified.continuation.continuationId,
    })
    expect(signedIn._tag).toBe("Authenticated")

    expect(
      yield* query(
        (sql) =>
          sql`SELECT c.revision = s.security_revision AS reconciled FROM auth_credentials c JOIN auth_subjects s ON s.id = c.auth_subject_id WHERE c.auth_subject_id = ${authSubjectId}`,
      ),
    ).toEqual([
      {
        reconciled: 1,
      },
    ])

    expect((yield* call(AuthenticationApi.actions.getSession))?.subjectId).toBe(authSubjectId)

    expect(yield* query((sql) => sql`SELECT id, name FROM auth_subjects`)).toEqual([
      {
        id: authSubjectId,
        name: identity.name,
      },
    ])

    expect(yield* query((sql) => sql`SELECT id FROM profiles`)).toHaveLength(1)
    expect(yield* query((sql) => sql`SELECT id FROM people`)).toHaveLength(1)
    yield* query((sql) => sql`UPDATE auth_subjects SET active = 0 WHERE id = ${authSubjectId}`)

    expect(
      (yield* fetchRoute({
        path: "/protected",
      })).status,
    ).toBe(401)

    expect(yield* call(AuthenticationApi.actions.getSession)).toBeNull()
    yield* query((sql) => sql`UPDATE auth_subjects SET active = 1 WHERE id = ${authSubjectId}`)

    const requestProof = Effect.fn(function* (email: string) {
      const pendingIdentity = {
        email,
        name: "Pending Person",
        flowId: crypto.randomUUID(),
      }

      yield* call(AuthenticationApi.actions.beginMagicLink, {
        flowId: pendingIdentity.flowId,
      })

      yield* call(AuthenticationApi.actions.requestMagicLink, {
        ...pendingIdentity,
        requestId: crypto.randomUUID(),
        locale: "en",
      })

      yield* Effect.tryPromise(
        async () => await expect.poll(() => deliveries.at(-1)?.to).toBe(email),
      )
      const delivery = deliveries.at(-1)
      if (delivery === undefined || delivery.to !== email) {
        return yield* Effect.die("missing pending email")
      }
      const { proof: parsed } = yield* parseDeliveredMagicLink(delivery)
      return {
        pendingIdentity,
        proof: parsed,
      }
    })

    const expired = yield* requestProof("expired@example.com")
    yield* query(
      (sql) =>
        sql`UPDATE auth_proof_generations SET expires_at = 0 WHERE proof_id = ${expired.proof.reference.proofId}`,
    )

    expect(
      (yield* fetchRoute({
        path: "/api/auth/verifyMagicLink",
        method: "POST",
        body: {
          payload: {
            ...expired.pendingIdentity,
            reference: expired.proof.reference,
            secret: Redacted.value(expired.proof.secret),
          },
        },
      })).status,
    ).not.toBe(200)

    const pending = yield* requestProof("continuation@example.com")

    const pendingVerified = yield* call(AuthenticationApi.actions.verifyMagicLink, {
      ...pending.pendingIdentity,
      reference: pending.proof.reference,
      secret: Redacted.value(pending.proof.secret),
    })

    yield* query(
      (sql) =>
        sql`UPDATE auth_proof_continuations SET expires_at = 0 WHERE continuation_id = ${pendingVerified.continuation.continuationId}`,
    )

    expect(
      (yield* fetchRoute({
        path: "/api/auth/completeMagicLink",
        method: "POST",
        body: {
          payload: {
            ...pending.pendingIdentity,
            continuationId: pendingVerified.continuation.continuationId,
          },
        },
      })).status,
    ).not.toBe(200)

    expect(yield* query((sql) => sql`SELECT id FROM auth_subjects`)).toHaveLength(1)
    const failed = yield* requestProof("rollback@example.com")

    const failedVerified = yield* call(AuthenticationApi.actions.verifyMagicLink, {
      ...failed.pendingIdentity,
      reference: failed.proof.reference,
      secret: Redacted.value(failed.proof.secret),
    })

    yield* query(
      (sql) =>
        sql`CREATE TRIGGER reject_profile BEFORE INSERT ON profiles BEGIN SELECT RAISE(ABORT, 'simulate profile write failure'); END`,
    )

    expect(
      (yield* fetchRoute({
        path: "/api/auth/completeMagicLink",
        method: "POST",
        body: {
          payload: {
            ...failed.pendingIdentity,
            continuationId: failedVerified.continuation.continuationId,
          },
        },
      })).status,
    ).not.toBe(200)

    expect(yield* query((sql) => sql`SELECT id FROM auth_subjects`)).toHaveLength(1)
    expect(yield* query((sql) => sql`SELECT id FROM profiles`)).toHaveLength(1)
    expect(yield* query((sql) => sql`SELECT credential_id FROM auth_credentials`)).toHaveLength(1)
  }),
)
