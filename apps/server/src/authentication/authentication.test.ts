import { NodeHttpServer } from "@effect/platform-node"
import { expect, it as test } from "@effect/vitest"
import {
  AuthenticationApi,
  AuthenticationHttp,
  PersonId,
  ProfileId,
  SessionContext,
  DEFAULT_AUTHENTICATION_RETURN_TARGET,
} from "@gororobas/domain"
import { Proofs } from "@yielded/auth"
import {
  Context,
  DateTime,
  Effect,
  Layer,
  ManagedRuntime,
  Redacted,
  Schedule,
  Schema,
} from "effect"
import { HttpClient, HttpClientRequest, HttpRouter } from "effect/http"
import { HttpApi, HttpApiBuilder, HttpApiEndpoint, HttpApiGroup } from "effect/http-api"
import { SqlClient } from "effect/sql"

import {
  authenticationTestOrigin,
  authenticationTestBindingKey,
  authenticationTestProofKey,
  AuthenticationTestInfrastructure,
  captureEmailDelivery,
  makeAuthenticationTestBrowser,
  parseDeliveredCode,
} from "../../test/authentication-helpers.js"
import { completeOnboarding } from "../people/onboarding.js"
import { ProfilesRepository } from "../profiles/repository.js"
import { SessionServiceLive } from "../session-service.js"
import { makeAuthentication } from "./app-auth.js"
import { authenticationLayer } from "./authentication-live.js"
import { deleteUnclaimedAccounts } from "./unclaimed-accounts.js"

const ProtectedApi = HttpApi.make("test/authentication").add(
  HttpApiGroup.make("protected")
    .add(
      HttpApiEndpoint.get("account", "/protected", {
        success: Schema.Struct({ authSubjectId: Schema.String, sessionType: Schema.String }),
      }),
    )
    .middleware(AuthenticationHttp.RequireSession),
)

const ProtectedHandlers = HttpApiBuilder.group(ProtectedApi, "protected", (handlers) =>
  handlers.handle("account", () =>
    Effect.gen(function* () {
      const authentication = yield* AuthenticationHttp.CurrentSession
      const session = yield* SessionContext
      if (authentication === null) return yield* Effect.die("authenticated account missing")
      return {
        authSubjectId: authentication.subjectId,
        sessionType: session.type === "ACCOUNT" ? session.accessLevel : session.type,
      }
    }).pipe(Effect.provide(SessionServiceLive), Effect.orDie),
  ),
)

test.live.each([authenticationTestOrigin, "http://localhost:4443"])(
  "%s: one email flow signs up, claims, onboards and signs back in",
  Effect.fn(function* (origin) {
    const runtime = yield* Effect.acquireRelease(
      Effect.sync(() => ManagedRuntime.make(AuthenticationTestInfrastructure)),
      (resource) => Effect.orDie(Effect.tryPromise(() => resource.dispose())),
    )
    const runtimeContext = yield* runtime.contextEffect
    const { deliveries, layer: deliveryLayer } = captureEmailDelivery()

    const authentication = authenticationLayer({
      origin,
      environment: "development",
      requestBindingKey: authenticationTestBindingKey,
      proofKey: authenticationTestProofKey,
    }).pipe(Layer.provide(deliveryLayer))

    const routes = HttpApiBuilder.layer(ProtectedApi).pipe(
      Layer.provide(ProtectedHandlers),
      Layer.provide(authentication),
      makeAuthentication(origin, "development").http.middleware,
      Layer.provideMerge(authentication),
      Layer.provide(Layer.succeedContext(runtimeContext)),
    )

    const app = yield* Effect.acquireRelease(
      Effect.sync(() => HttpRouter.toWebHandler(routes, { disableLogger: true })),
      (resource) => Effect.orDie(Effect.tryPromise(() => resource.dispose())),
    )

    const requestContext = Context.add(
      runtimeContext,
      Proofs.ProofRequestContext,
      Effect.succeed({ networkKey: Redacted.make("127.0.0.1") }),
    )

    const { fetchRoute, call, cookieHeader } = makeAuthenticationTestBrowser(
      (request) => app.handler(request, requestContext),
      origin,
    )

    const run = <A, E>(
      effect: Effect.Effect<A, E, Layer.Success<typeof AuthenticationTestInfrastructure>>,
    ) => effect.pipe(Effect.provide(runtimeContext))

    const query = <A extends object>(
      statement: (sql: SqlClient.SqlClient) => Effect.Effect<ReadonlyArray<A>, unknown>,
    ) => run(Effect.flatMap(SqlClient.SqlClient, statement))

    const flow = (flowId: string, email: string) => ({
      flowId,
      email,
      returnTarget: DEFAULT_AUTHENTICATION_RETURN_TARGET,
    })

    const requestCode = Effect.fn(function* (input: ReturnType<typeof flow>) {
      const count = deliveries.length
      yield* call(AuthenticationApi.actions.beginEmailSignIn, { flowId: input.flowId })

      const receipt = yield* call(AuthenticationApi.actions.requestEmailCode, {
        ...input,
        requestId: crypto.randomUUID(),
        locale: "en",
      })

      yield* Effect.sync(() => deliveries.length).pipe(
        Effect.repeat({ until: (n) => n > count, schedule: Schedule.spaced("10 millis") }),
        Effect.timeout("5 seconds"),
      )
      const message = deliveries.at(-1)
      if (message?.to !== input.email) return yield* Effect.die("missing email")
      return { receipt, message, ...parseDeliveredCode(message) }
    })

    const complete = ({
      input,
      reference,
      secret,
    }: {
      readonly input: ReturnType<typeof flow>
      readonly reference: Proofs.ProofReference
      readonly secret: string
    }) =>
      fetchRoute({
        path: AuthenticationApi.actions.completeEmailSignIn.route.path,
        method: "POST",
        body: { payload: { ...input, reference, secret } },
      })

    expect((yield* fetchRoute({ path: "/protected" })).status).toBe(401)

    yield* Effect.forEach(
      [{ "x-effect-auth-csrf": "" }, { origin: "https://evil.example" }],
      Effect.fn(function* (customHeaders) {
        const rejected = yield* fetchRoute({
          path: AuthenticationApi.actions.beginEmailSignIn.route.path,
          method: "POST",
          body: { payload: { flowId: "forged" } },
          customHeaders,
        })

        expect(rejected.status).not.toBe(200)
      }),
      { concurrency: 1 },
    )

    // Sign-up: an unknown address reserves an unclaimed account and gets the welcome wording.
    const signup = flow("signup-flow", "person@example.com")
    const firstCode = yield* requestCode(signup)
    expect(firstCode.message.subject).toContain("join Gororobas")
    expect(firstCode.link.origin + firstCode.link.pathname).toBe(`${origin}/login`)

    expect(
      yield* query(
        (sql) =>
          sql`SELECT is_email_verified, claimed_at FROM auth_subjects WHERE email = ${signup.email}`,
      ),
    ).toEqual([{ isEmailVerified: 0, claimedAt: null }])

    const wrongCode = firstCode.code === "000000" ? "111111" : "000000"

    expect(
      (yield* complete({
        input: signup,
        reference: firstCode.receipt.reference,
        secret: wrongCode,
      })).status,
    ).not.toBe(200)

    expect(
      (yield* fetchRoute({
        path: AuthenticationApi.actions.completeEmailSignIn.route.path,
        method: "POST",
        body: {
          payload: { ...signup, reference: firstCode.receipt.reference, secret: firstCode.code },
        },
        customHeaders: { cookie: "" },
      })).status,
    ).not.toBe(200)

    const completed = yield* call(AuthenticationApi.actions.completeEmailSignIn, {
      ...signup,
      reference: firstCode.receipt.reference,
      secret: firstCode.code,
    })

    if (completed.completion._tag !== "Authenticated") return yield* Effect.die("session missing")
    const authSubjectId = completed.completion.session.subjectId
    expect(completed.returnTarget).toBe(DEFAULT_AUTHENTICATION_RETURN_TARGET)

    expect(
      (yield* complete({
        input: signup,
        reference: firstCode.receipt.reference,
        secret: firstCode.code,
      })).status,
    ).not.toBe(200)

    const [claimed] = yield* query(
      (sql) =>
        sql`SELECT is_email_verified, claimed_at FROM auth_subjects WHERE id = ${authSubjectId}`,
    )
    expect(claimed).toMatchObject({ isEmailVerified: 1, claimedAt: expect.any(String) })

    // Signed in without a person: a visitor until onboarding.
    const beforeOnboarding = yield* fetchRoute({ path: "/protected" })
    expect(yield* Effect.tryPromise(() => beforeOnboarding.json())).toEqual({
      authSubjectId,
      sessionType: "VISITOR",
    })

    const profile = yield* run(
      completeOnboarding(PersonId.make(authSubjectId), { name: "Agroecology Person" }),
    )
    expect(profile.handle).toBe("agroecology-person")
    const afterOnboarding = yield* fetchRoute({ path: "/protected" })
    expect(yield* Effect.tryPromise(() => afterOnboarding.json())).toEqual({
      authSubjectId,
      sessionType: "NEWCOMER",
    })

    const previousCookies = cookieHeader()
    yield* call(AuthenticationApi.actions.signOut)
    expect(yield* call(AuthenticationApi.actions.getSession)).toBeNull()
    expect(
      (yield* fetchRoute({ path: "/protected", customHeaders: { cookie: previousCookies } }))
        .status,
    ).toBe(401)

    // Sign-in: same address, sign-in wording, same account.
    const signin = flow("signin-flow", signup.email)
    const secondCode = yield* requestCode(signin)
    expect(secondCode.message.subject).toContain("sign-in code")

    const signedIn = yield* call(AuthenticationApi.actions.completeEmailSignIn, {
      ...signin,
      reference: secondCode.receipt.reference,
      secret: secondCode.code,
    })

    expect(
      signedIn.completion._tag === "Authenticated" && signedIn.completion.session.subjectId,
    ).toBe(authSubjectId)
    expect(yield* query((sql) => sql`SELECT id FROM auth_subjects`)).toHaveLength(1)

    // Accounts created outside sign-in (like migrated ones) get their email credential on first use.
    const migratedId = "00000000-0000-7000-8000-00000000000a"
    const timestamp = DateTime.formatIso(yield* DateTime.now)

    yield* query(
      (sql) =>
        sql`INSERT INTO auth_subjects ${sql.insert({
          id: migratedId,
          email: "migrated@example.com",
          isEmailVerified: 0,
          securityRevision: "01900000-0000-7000-8000-000000000001",
          claimedAt: timestamp,
          createdAt: timestamp,
          updatedAt: timestamp,
        })} RETURNING id`,
    )

    const migrated = flow("migrated-flow", "migrated@example.com")
    const migratedCode = yield* requestCode(migrated)
    expect(migratedCode.message.subject).toContain("sign-in code")

    const migratedSignIn = yield* call(AuthenticationApi.actions.completeEmailSignIn, {
      ...migrated,
      reference: migratedCode.receipt.reference,
      secret: migratedCode.code,
    })

    expect(
      migratedSignIn.completion._tag === "Authenticated" &&
        migratedSignIn.completion.session.subjectId,
    ).toBe(migratedId)

    // Abandoned sign-ups disappear; claimed accounts stay.
    yield* requestCode(flow("typo-flow", "persn@example.com"))
    yield* query(
      (sql) => sql`UPDATE auth_subjects SET active = 0 WHERE id = ${migratedId} RETURNING id`,
    )
    const inactive = flow("inactive-flow", "migrated@example.com")
    yield* call(AuthenticationApi.actions.beginEmailSignIn, { flowId: inactive.flowId })
    const deliveredBefore = deliveries.length

    yield* call(AuthenticationApi.actions.requestEmailCode, {
      ...inactive,
      requestId: crypto.randomUUID(),
      locale: "en",
    })

    yield* Effect.sleep("100 millis")
    expect(deliveries.length).toBe(deliveredBefore)

    yield* run(
      deleteUnclaimedAccounts({
        createdBefore: DateTime.add(yield* DateTime.now, { minutes: 1 }),
      }),
    )

    expect(
      (yield* query((sql) => sql`SELECT email FROM auth_subjects ORDER BY email`)).map(
        (row) => row.email,
      ),
    ).toEqual(["migrated@example.com", signup.email])

    // Deleting an account removes the proofs bound to its address.
    yield* requestCode(flow("deletion-flow", signup.email))

    yield* run(
      ProfilesRepository.make.pipe(
        Effect.flatMap((repository) =>
          repository.deleteProfileReturningMediaAssets(ProfileId.make(authSubjectId)),
        ),
      ),
    )

    expect(JSON.stringify(yield* query((sql) => sql`SELECT * FROM auth_proofs`))).not.toContain(
      signup.email,
    )
    expect(yield* call(AuthenticationApi.actions.getSession)).toBeNull()
  }),
)

// Web Request fixtures reuse their body; a native Node request exposes stream consumption bugs.
test.live.each([
  { environment: "development", origin: "http://localhost:4443", secure: false },
  { environment: "development", origin: authenticationTestOrigin, secure: true },
  { environment: "test", origin: "http://localhost:4443", secure: true },
  { environment: "test", origin: authenticationTestOrigin, secure: true },
  { environment: "production", origin: "http://localhost:4443", secure: true },
  { environment: "production", origin: authenticationTestOrigin, secure: true },
] as const)(
  "native HTTP auth routes admit a POST body with cookie settings: %j",
  ({ environment, origin, secure }) => {
    const { layer: deliveryLayer } = captureEmailDelivery()

    const routes = authenticationLayer({
      origin,
      environment,
      requestBindingKey: authenticationTestBindingKey,
      proofKey: authenticationTestProofKey,
    }).pipe(Layer.provide(deliveryLayer), Layer.provide(AuthenticationTestInfrastructure))

    const server = HttpRouter.serve(routes).pipe(Layer.provideMerge(NodeHttpServer.layerTest))

    return Effect.gen(function* () {
      const context = yield* Layer.build(server)
      const http = Context.get(context, HttpClient.HttpClient)

      const request = yield* HttpClientRequest.post(
        AuthenticationApi.actions.beginEmailSignIn.route.path,
      ).pipe(
        HttpClientRequest.setHeaders({ origin, "x-effect-auth-csrf": "1" }),
        HttpClientRequest.bodyJson({ payload: { flowId: "native-browser-flow" } }),
      )

      const response = yield* http.execute(request)
      expect(response.status).toBe(200)
      expect(response.headers["set-cookie"]).toContain("HttpOnly")
      expect(/;\s*Secure(?:;|$)/i.test(response.headers["set-cookie"] ?? "")).toBe(secure)
      expect(response.headers["set-cookie"]?.startsWith("__Host-")).toBe(secure)
    })
  },
)
