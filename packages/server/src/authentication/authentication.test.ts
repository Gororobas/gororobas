// @todo refactor to use Effect vitest
import { AuthenticationApi, AuthenticationHttp, SessionContext } from "@gororobas/domain"
import { Proofs } from "@yielded/auth"
import { Context, Effect, Layer, ManagedRuntime, Redacted, Schema } from "effect"
import { HttpRouter } from "effect/http"
import { HttpApi, HttpApiBuilder, HttpApiEndpoint, HttpApiGroup } from "effect/http-api"
import { SqlClient } from "effect/sql"
import { expect, test } from "vitest"

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
        success: Schema.Struct({ authSubjectId: Schema.String, accessLevel: Schema.String }),
      }),
    )
    .middleware(AuthenticationHttp.RequireSession),
)
const ProtectedHandlers = HttpApiBuilder.group(ProtectedApi, "protected", (handlers) =>
  handlers.handle("account", () =>
    Effect.gen(function* () {
      const authentication = yield* AuthenticationHttp.CurrentSession
      const session = yield* SessionContext
      if (authentication === null || session.type !== "ACCOUNT")
        return yield* Effect.die("authenticated account missing")
      return { authSubjectId: authentication.subjectId, accessLevel: session.accessLevel }
    }).pipe(Effect.provide(SessionServiceLive), Effect.orDie),
  ),
)

test("HTTP vertical slice: magic-link signup, protected access, sign-out and existing-account sign-in", async () => {
  const runtime = ManagedRuntime.make(AuthenticationTestInfrastructure)
  const database = Layer.succeedContext(await runtime.context())
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
  const app = HttpRouter.toWebHandler(routes, { disableLogger: true })
  const requestContext = Context.add(
    await runtime.context(),
    Proofs.ProofRequestContext,
    Effect.succeed({ networkKey: Redacted.make("127.0.0.1") }),
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
  ) => runtime.runPromise(Effect.flatMap(SqlClient.SqlClient, statement))
  try {
    expect((await fetchRoute("/protected")).status).toBe(401)
    const noCsrf = await fetchRoute(
      "/api/auth/beginMagicLink",
      "POST",
      { payload: { flowId: "csrf" } },
      { "x-effect-auth-csrf": "" },
    )
    expect(noCsrf.status).not.toBe(200)
    const wrongOrigin = await fetchRoute(
      "/api/auth/beginMagicLink",
      "POST",
      { payload: { flowId: "origin" } },
      { origin: "https://evil.example" },
    )
    expect(wrongOrigin.status).not.toBe(200)
    await call(AuthenticationApi.actions.beginMagicLink, { flowId: identity.flowId })
    const receipt = await call(AuthenticationApi.actions.requestMagicLink, {
      ...identity,
      requestId: "signup-request",
      locale: "en",
    })
    await call(AuthenticationApi.actions.requestMagicLink, {
      ...identity,
      requestId: "signup-request",
      locale: "en",
    })
    await expect.poll(() => deliveries.length).toBe(1)
    expect(await query((sql) => sql`SELECT id FROM auth_subjects`)).toHaveLength(0)
    const message = deliveries[0]
    if (message === undefined) throw new Error("missing email")
    expect(message.to).toBe(identity.email)
    const { link, proof } = await Effect.runPromise(parseDeliveredMagicLink(message))
    expect(link.search).toBe("")
    const landing = await fetchRoute(link.pathname)
    expect(landing.status).toBe(200)
    expect(landing.headers.get("cache-control")).toBe("no-store")
    expect(await query((sql) => sql`SELECT id FROM auth_subjects`)).toHaveLength(0)
    expect(proof.reference).toEqual(receipt.reference)
    const tampered = await fetchRoute("/api/auth/verifyMagicLink", "POST", {
      payload: {
        ...identity,
        name: "Different Person",
        reference: proof.reference,
        secret: Redacted.value(proof.secret),
      },
    })
    expect(tampered.status).not.toBe(200)
    const withoutBinding = await fetchRoute(
      "/api/auth/verifyMagicLink",
      "POST",
      {
        payload: {
          ...identity,
          reference: proof.reference,
          secret: Redacted.value(proof.secret),
        },
      },
      { cookie: "" },
    )
    expect(withoutBinding.status).not.toBe(200)
    const verified = await call(AuthenticationApi.actions.verifyMagicLink, {
      ...identity,
      reference: proof.reference,
      secret: Redacted.value(proof.secret),
    })
    const completed = await call(AuthenticationApi.actions.completeMagicLink, {
      ...identity,
      continuationId: verified.continuation.continuationId,
    })
    expect(completed._tag).toBe("Authenticated")
    if (completed._tag !== "Authenticated") throw new Error("session missing")
    const authSubjectId = completed.session.subjectId
    expect(
      await query(
        (sql) => sql`SELECT a.id, a.is_email_verified, p.type, pe.access_level
      FROM auth_subjects a JOIN profiles p ON p.id = a.id JOIN people pe ON pe.id = a.id`,
      ),
    ).toEqual([{ id: authSubjectId, isEmailVerified: 1, type: "PERSON", accessLevel: "NEWCOMER" }])
    const protectedResponse = await fetchRoute("/protected")
    expect(protectedResponse.status).toBe(200)
    expect(await protectedResponse.json()).toEqual({ authSubjectId, accessLevel: "NEWCOMER" })
    expect((await call(AuthenticationApi.actions.getSession))?.subjectId).toBe(authSubjectId)
    await query(
      (sql) => sql`UPDATE people SET access_level = 'COMMUNITY' WHERE id = ${authSubjectId}`,
    )
    expect(await (await fetchRoute("/protected")).json()).toEqual({
      authSubjectId,
      accessLevel: "COMMUNITY",
    })
    const replay = await fetchRoute("/api/auth/verifyMagicLink", "POST", {
      payload: {
        ...identity,
        reference: proof.reference,
        secret: Redacted.value(proof.secret),
      },
    })
    expect(replay.status).not.toBe(200)
    const repeatCompletion = await fetchRoute("/api/auth/completeMagicLink", "POST", {
      payload: {
        ...identity,
        continuationId: verified.continuation.continuationId,
      },
    })
    expect(repeatCompletion.status).not.toBe(200)
    const previousCookies = cookieHeader()
    await query(
      (sql) =>
        sql`UPDATE auth_credentials SET revision = 'stale' WHERE auth_subject_id = ${authSubjectId}`,
    )
    await call(AuthenticationApi.actions.signOut)
    expect(await call(AuthenticationApi.actions.getSession)).toBeNull()
    expect(
      (await fetchRoute("/protected", "GET", undefined, { cookie: previousCookies })).status,
    ).toBe(401)
    expect(await query((sql) => sql`SELECT session_id FROM auth_sessions`)).toHaveLength(0)
    // Move the stored cooldown into the past to simulate waiting between logins.
    await query((sql) => sql`UPDATE auth_proof_series SET last_issue_at = last_issue_at - 30001`)
    const login = {
      ...identity,
      flowId: "signin-flow",
      name: "Name must not overwrite existing profile",
    }
    await call(AuthenticationApi.actions.beginMagicLink, { flowId: login.flowId })
    await call(AuthenticationApi.actions.requestMagicLink, {
      ...login,
      requestId: "signin-request",
      locale: "en",
    })
    await expect.poll(() => deliveries.length).toBe(2)
    const next = deliveries[1]
    if (next === undefined) throw new Error("missing sign-in email")
    const { proof: nextProof } = await Effect.runPromise(parseDeliveredMagicLink(next))
    const signInVerified = await call(AuthenticationApi.actions.verifyMagicLink, {
      ...login,
      reference: nextProof.reference,
      secret: Redacted.value(nextProof.secret),
    })
    const signedIn = await call(AuthenticationApi.actions.completeMagicLink, {
      ...login,
      continuationId: signInVerified.continuation.continuationId,
    })
    expect(signedIn._tag).toBe("Authenticated")
    expect(
      await query(
        (sql) =>
          sql`SELECT c.revision = s.security_revision AS reconciled FROM auth_credentials c JOIN auth_subjects s ON s.id = c.auth_subject_id WHERE c.auth_subject_id = ${authSubjectId}`,
      ),
    ).toEqual([{ reconciled: 1 }])
    expect((await call(AuthenticationApi.actions.getSession))?.subjectId).toBe(authSubjectId)
    expect(await query((sql) => sql`SELECT id, name FROM auth_subjects`)).toEqual([
      { id: authSubjectId, name: identity.name },
    ])
    expect(await query((sql) => sql`SELECT id FROM profiles`)).toHaveLength(1)
    expect(await query((sql) => sql`SELECT id FROM people`)).toHaveLength(1)
    await query((sql) => sql`UPDATE auth_subjects SET active = 0 WHERE id = ${authSubjectId}`)
    expect((await fetchRoute("/protected")).status).toBe(401)
    expect(await call(AuthenticationApi.actions.getSession)).toBeNull()
    await query((sql) => sql`UPDATE auth_subjects SET active = 1 WHERE id = ${authSubjectId}`)

    const requestProof = async (email: string) => {
      const pendingIdentity = { email, name: "Pending Person", flowId: crypto.randomUUID() }
      await call(AuthenticationApi.actions.beginMagicLink, { flowId: pendingIdentity.flowId })
      await call(AuthenticationApi.actions.requestMagicLink, {
        ...pendingIdentity,
        requestId: crypto.randomUUID(),
        locale: "en",
      })
      await expect.poll(() => deliveries.at(-1)?.to).toBe(email)
      const delivery = deliveries.at(-1)
      if (delivery === undefined || delivery.to !== email) throw new Error("missing pending email")
      const { proof: parsed } = await Effect.runPromise(parseDeliveredMagicLink(delivery))
      return { pendingIdentity, proof: parsed }
    }
    const expired = await requestProof("expired@example.com")
    await query(
      (sql) =>
        sql`UPDATE auth_proof_generations SET expires_at = 0 WHERE proof_id = ${expired.proof.reference.proofId}`,
    )
    expect(
      (
        await fetchRoute("/api/auth/verifyMagicLink", "POST", {
          payload: {
            ...expired.pendingIdentity,
            reference: expired.proof.reference,
            secret: Redacted.value(expired.proof.secret),
          },
        })
      ).status,
    ).not.toBe(200)

    const pending = await requestProof("continuation@example.com")
    const pendingVerified = await call(AuthenticationApi.actions.verifyMagicLink, {
      ...pending.pendingIdentity,
      reference: pending.proof.reference,
      secret: Redacted.value(pending.proof.secret),
    })
    await query(
      (sql) =>
        sql`UPDATE auth_proof_continuations SET expires_at = 0 WHERE continuation_id = ${pendingVerified.continuation.continuationId}`,
    )
    expect(
      (
        await fetchRoute("/api/auth/completeMagicLink", "POST", {
          payload: {
            ...pending.pendingIdentity,
            continuationId: pendingVerified.continuation.continuationId,
          },
        })
      ).status,
    ).not.toBe(200)
    expect(await query((sql) => sql`SELECT id FROM auth_subjects`)).toHaveLength(1)

    const failed = await requestProof("rollback@example.com")
    const failedVerified = await call(AuthenticationApi.actions.verifyMagicLink, {
      ...failed.pendingIdentity,
      reference: failed.proof.reference,
      secret: Redacted.value(failed.proof.secret),
    })
    await query(
      (sql) =>
        sql`CREATE TRIGGER reject_profile BEFORE INSERT ON profiles BEGIN SELECT RAISE(ABORT, 'simulate profile write failure'); END`,
    )
    expect(
      (
        await fetchRoute("/api/auth/completeMagicLink", "POST", {
          payload: {
            ...failed.pendingIdentity,
            continuationId: failedVerified.continuation.continuationId,
          },
        })
      ).status,
    ).not.toBe(200)
    expect(await query((sql) => sql`SELECT id FROM auth_subjects`)).toHaveLength(1)
    expect(await query((sql) => sql`SELECT id FROM profiles`)).toHaveLength(1)
    expect(await query((sql) => sql`SELECT credential_id FROM auth_credentials`)).toHaveLength(1)
  } finally {
    await app.dispose()
    await runtime.dispose()
  }
})
