import { AuthenticationApi, AuthSecurityRevision, AuthSubjectId } from "@gororobas/domain"
import { Proofs } from "@yielded/auth"
import { Context, Effect, Layer, ManagedRuntime, Redacted, Schema } from "effect"
import { HttpRouter } from "effect/http"
import { SqlClient } from "effect/sql"
import { expect, test } from "vitest"

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
  value: Schema.Struct({ authorizationUrl: Schema.String }),
})
const completion = Schema.Struct({
  _tag: Schema.Literal("Success"),
  value: AuthenticationApi.actions.completeOAuth.route.operation.rpc.successSchema,
})

test("OAuth binds and consumes flows, relays Apple POSTs, and connects identities without email-based account linking", async () => {
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
          emailVerified: input.provider !== "microsoft",
          name: "Provider Person",
        }
      }),
  })

  const runtime = ManagedRuntime.make(AuthenticationTestInfrastructure)
  const { layer: deliveryLayer } = captureEmailDelivery()

  const routes = authenticationLayer({
    origin,
    requestBindingKey: authenticationTestBindingKey,
    oauthProtocol: protocol,
  }).pipe(
    Layer.provide(deliveryLayer),
    Layer.provide(Layer.succeedContext(await runtime.context())),
  )

  const app = HttpRouter.toWebHandler(routes, { disableLogger: true })
  const context = Context.make(
    Proofs.ProofRequestContext,
    Effect.succeed({ networkKey: Redacted.make("127.0.0.1") }),
  )
  const { fetchRoute, cookieHeader } = makeAuthenticationTestBrowser((request) =>
    app.handler(request, context),
  )

  const request = async ({
    path,
    payload,
    cookie = cookieHeader(),
  }: {
    path: string
    payload?: unknown
    cookie?: string | undefined
  }) => {
    return fetchRoute({
      path: path,
      method: payload === undefined ? "GET" : "POST",
      body: payload === undefined ? undefined : { payload },
      customHeaders: { cookie },
    })
  }

  const begin = async (provider: "apple" | "google" | "microsoft") => {
    const flowId = crypto.randomUUID()
    const response = await request({ path: "/api/auth/beginOAuth", payload: { provider, flowId } })
    expect(response.status).toBe(200)
    // oxlint-disable-next-line custom-lint-rules/no-schema-decode-unknown -- HTTP response JSON has not yet been validated against its response schema.
    const result = Schema.decodeUnknownSync(authorization)(await response.json())
    const state = new URL(result.value.authorizationUrl).searchParams.get("state")
    if (state === null) throw new Error("missing state")
    return { provider, flowId, state, code: "approved-code" }
  }

  const finish = async (input: Awaited<ReturnType<typeof begin>>) => {
    const response = await request({ path: "/api/auth/completeOAuth", payload: input })
    expect(response.status).toBe(200)
    // oxlint-disable-next-line custom-lint-rules/no-schema-decode-unknown -- HTTP response JSON has not yet been validated against its response schema.
    const value = Schema.decodeUnknownSync(completion)(await response.json()).value
    if (value._tag !== "Authenticated") throw new Error("missing session")
    return value.session.subjectId
  }

  const query = <A extends object>(
    execute: (sql: SqlClient.SqlClient) => Effect.Effect<ReadonlyArray<A>, unknown>,
  ) => runtime.runPromise(Effect.flatMap(SqlClient.SqlClient, execute))

  try {
    const google = await begin("google")
    expect(
      (await request({ path: "/api/auth/completeOAuth", payload: google, cookie: "" })).status,
    ).not.toBe(200)
    expect(
      (await request({ path: "/api/auth/completeOAuth", payload: { ...google, state: "wrong" } }))
        .status,
    ).not.toBe(200)

    expect(
      (
        await request({
          path: "/api/auth/completeOAuth",
          payload: { ...google, provider: "apple" },
        })
      ).status,
    ).not.toBe(200)

    expect(exchanges).toBe(0)
    const authSubjectId = await finish(google)
    expect((await request({ path: "/api/auth/completeOAuth", payload: google })).status).not.toBe(
      200,
    )
    expect(exchanges).toBe(1)
    const rows = await query((sql) => sql`SELECT id, security_revision FROM auth_subjects`)
    expect(rows).toHaveLength(1)
    // oxlint-disable-next-line custom-lint-rules/no-schema-decode-unknown -- Raw SQL rows have no statically known selected columns.
    Schema.decodeUnknownSync(
      Schema.Array(Schema.Struct({ id: AuthSubjectId, securityRevision: AuthSecurityRevision })),
    )(rows)
    const lostSession = await begin("microsoft")
    await request({ path: "/api/auth/signOut", payload: {} })
    expect(
      (await request({ path: "/api/auth/completeOAuth", payload: lostSession })).status,
    ).not.toBe(200)
    expect(exchanges).toBe(1)
    subjectSuffix = "-unverified"
    const unverified = await request({
      path: "/api/auth/completeOAuth",
      payload: await begin("microsoft"),
    })
    expect(unverified.status).not.toBe(200)
    expect(await unverified.text()).toContain("email-verification-required")
    subjectSuffix = ""
    expect(await finish(await begin("google"))).toBe(authSubjectId)
    const microsoft = await begin("microsoft")
    expect(await finish(microsoft)).toBe(authSubjectId)
    await request({ path: "/api/auth/signOut", payload: {} })
    expect(await finish(await begin("microsoft"))).toBe(authSubjectId)
    await request({ path: "/api/auth/signOut", payload: {} })
    const apple = await begin("apple")

    const relay = await app.handler(
      new Request(`${origin}/api/auth/apple/callback`, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ state: apple.state, code: apple.code }),
      }),
      context,
    )

    expect(relay.status).toBe(303)
    expect(relay.headers.get("location")).toContain("#oauth=")
    expect(exchanges).toBe(5)
    // An existing email cannot silently acquire a new external login.
    const conflict = await request({ path: "/api/auth/completeOAuth", payload: apple })
    expect(conflict.status).not.toBe(200)
    expect(await conflict.text()).toContain("account-conflict")
    expect(await query((sql) => sql`SELECT id FROM auth_subjects`)).toHaveLength(1)
    email = "apple@example.com"
    const appleAuthSubjectId = await finish(await begin("apple"))
    expect(appleAuthSubjectId).not.toBe(authSubjectId)
    await request({ path: "/api/auth/signOut", payload: {} })
    // Expired flows never exchange a code or establish a session.
    const expired = await begin("google")
    await query(
      (sql) => sql`UPDATE auth_oauth_flows SET expires_at = 0 WHERE state = ${expired.state}`,
    )
    const beforeExpiry = exchanges
    expect((await request({ path: "/api/auth/completeOAuth", payload: expired })).status).not.toBe(
      200,
    )
    expect(exchanges).toBe(beforeExpiry)
    await query(
      (sql) => sql`UPDATE auth_credentials SET active = 0 WHERE auth_subject_id = ${authSubjectId}`,
    )
    const revoked = await request({
      path: "/api/auth/completeOAuth",
      payload: await begin("microsoft"),
    })
    expect(revoked.status).not.toBe(200)
    expect(await revoked.text()).toContain("account-conflict")
    expect(await query((sql) => sql`SELECT id FROM auth_subjects`)).toHaveLength(2)
  } finally {
    await app.dispose()
    await runtime.dispose()
  }
})
