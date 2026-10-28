/**
 * In-process HTTP harness running the production `ApiLive` composition behind the real
 * authentication stack: routing, cookies and sessions, endpoint schemas, handlers, services and
 * policies, against the caller's database.
 *
 * People sign in through the email-code flow; codes are captured in memory instead of being sent.
 * The app runs on the real clock: sign-in proofs and sessions are checked against the database's
 * own clock. Scenarios that use a `TestClock` must start it at real time
 * (`startTestClockAtRealTime`) before creating data whose timestamps the API compares.
 */
import { NodeHttpServer, NodeServices } from "@effect/platform-node"
import {
  AuthenticationApi,
  DEFAULT_AUTHENTICATION_RETURN_TARGET,
  GororobasApi,
  type IdGen,
  type PersonId,
} from "@gororobas/domain"
import { LinkInferenceModelStub } from "@gororobas/domain"
import { Proofs } from "@yielded/auth"
import {
  Clock,
  Config,
  ConfigProvider,
  Context,
  Effect,
  FileSystem,
  Layer,
  Option,
  Redacted,
  Schedule,
  Schema,
} from "effect"
import { FetchHttpClient, HttpRouter } from "effect/http"
import { HttpApiClient } from "effect/http-api"
import { SqlClient, SqlSchema } from "effect/sql"
import { TestClock } from "effect/testing"
import { WorkflowEngine } from "effect/workflow"

import { ApiLive } from "../src/api-live.js"
import { makeAuthentication } from "../src/authentication/app-auth.js"
import { authenticationLayer } from "../src/authentication/authentication-live.js"
import { LanguageDetectionServiceStub } from "../src/translation/language-detection-service.js"
import { TranslationService } from "../src/translation/translation-service.js"
import { WorkflowsLive } from "../src/workflows-live.js"
import {
  authenticationTestBindingKey,
  authenticationTestOrigin,
  authenticationTestProofKey,
  captureEmailDelivery,
  makeAuthenticationTestBrowser,
  parseDeliveredCode,
} from "./authentication-helpers.js"

type TestBrowser = ReturnType<typeof makeAuthenticationTestBrowser>

class SignInEmailMissingError extends Schema.TaggedError<SignInEmailMissingError>()(
  "SignInEmailMissingError",
  { email: Schema.String },
) {}

const StubTranslationService = Layer.succeed(TranslationService, {
  getServiceId: () => "test",
  translate: ({ text }) => Effect.succeed(text),
})

const findEmail = SqlSchema.findOne({
  Request: Schema.String,
  Result: Schema.Struct({ email: Schema.String }),
  execute: (id) =>
    SqlClient.SqlClient.use((sql) => sql`SELECT email FROM auth_subjects WHERE id = ${id}`),
})

export const startTestClockAtRealTime = Effect.flatMap(
  Effect.sync(() => Clock.Clock.defaultValue().currentTimeMillisUnsafe()),
  TestClock.setTime,
)

const makeApiTestClient = Effect.gen(function* () {
  // The auth stack needs real time, so the app never runs on the caller's TestClock.
  const context = Context.add(
    yield* Effect.context<SqlClient.SqlClient | IdGen | WorkflowEngine.WorkflowEngine>(),
    Clock.Clock,
    Clock.Clock.defaultValue(),
  )

  // Callers that seeded media point the app at it; otherwise the app gets an empty directory.
  const mediaDirectory = yield* Config.String("MEDIA_ASSETS_DIRECTORY").pipe(
    Config.option,
    Effect.flatMap(
      Option.match({
        onSome: Effect.succeed,
        onNone: () =>
          Effect.flatMap(FileSystem.FileSystem, (fileSystem) =>
            fileSystem.makeTempDirectoryScoped({ prefix: "api-test-media-" }),
          ),
      }),
    ),
  )

  const { deliveries, layer: deliveryLayer } = captureEmailDelivery()

  const dependencies = Layer.mergeAll(
    Layer.succeedContext(context),
    NodeServices.layer,
    NodeHttpServer.layerHttpServices,
    Layer.succeed(
      ConfigProvider.ConfigProvider,
      ConfigProvider.fromUnknown({ MEDIA_ASSETS_DIRECTORY: mediaDirectory }),
    ),
    // Tests never reach external providers (Google Books, Wikidata, GBIF).
    Layer.succeed(FetchHttpClient.Fetch, () =>
      Promise.resolve(new Response("Outbound HTTP is disabled in API tests", { status: 503 })),
    ),
  )

  const app = yield* Effect.acquireRelease(
    Effect.sync(() =>
      HttpRouter.toWebHandler(
        // Workflows are registered like `main.ts` does, so endpoints that submit them behave as in
        // production; they read the repositories ApiLive provides.
        WorkflowsLive.pipe(
          Layer.provide(StubTranslationService),
          Layer.provide(LanguageDetectionServiceStub),
          Layer.provide(LinkInferenceModelStub),
          Layer.provideMerge(
            ApiLive.pipe(
              makeAuthentication(authenticationTestOrigin, "test").http.middleware,
              Layer.provide(
                authenticationLayer({
                  origin: authenticationTestOrigin,
                  environment: "test",
                  requestBindingKey: authenticationTestBindingKey,
                  proofKey: authenticationTestProofKey,
                }).pipe(Layer.provide(deliveryLayer)),
              ),
            ),
          ),
          HttpRouter.provideRequest(dependencies),
          Layer.provideMerge(dependencies),
        ),
        { disableLogger: true },
      ),
    ),
    (app) => Effect.tryPromise(() => app.dispose()).pipe(Effect.orDie),
  )

  // Production servers derive the network key from the connection; tests share a loopback one.
  const requestContext = Context.make(
    Proofs.ProofRequestContext,
    Effect.succeed({ networkKey: Redacted.make("127.0.0.1") }),
  )
  const handler = (request: Request) => app.handler(request, requestContext)

  /** A `fetch` that sends `browser`'s cookies, for routes the typed client doesn't describe. */
  const fetchWith = (browser: TestBrowser): typeof globalThis.fetch => {
    // Origin and Cookie are forbidden on an existing Request's headers, so build a new one.
    return (input, init) => {
      const headers = new Headers(init?.headers)
      headers.set("origin", authenticationTestOrigin)
      headers.set("x-effect-auth-csrf", "1")
      headers.set("cookie", browser.cookieHeader())
      return handler(new Request(input, { ...init, headers }))
    }
  }

  /** Sends a raw request as `browser`, for routes the typed client doesn't describe. */
  const requestWith =
    (browser: TestBrowser) =>
    ({ path, ...init }: RequestInit & { readonly path: string }) =>
      Effect.tryPromise(() => fetchWith(browser)(`${authenticationTestOrigin}${path}`, init))

  const clientWith = (browser: TestBrowser) =>
    HttpApiClient.make(GororobasApi, { baseUrl: authenticationTestOrigin }).pipe(
      Effect.provide(FetchHttpClient.layer),
      Effect.provideService(FetchHttpClient.Fetch, fetchWith(browser)),
    )

  /** A browser with its own cookie jar, like a person's device. */
  const newBrowser = () => makeAuthenticationTestBrowser(handler, authenticationTestOrigin)

  /** A typed client for someone browsing without signing in. */
  const visitor = clientWith(newBrowser())

  /** Starts an email sign-in in `browser` and returns the code delivered to `email`. */
  const requestCode = (browser: TestBrowser, email: string) =>
    Effect.gen(function* () {
      const flow = {
        flowId: crypto.randomUUID(),
        email,
        returnTarget: DEFAULT_AUTHENTICATION_RETURN_TARGET,
      }

      const sent = deliveries.length
      yield* browser.call(AuthenticationApi.actions.beginEmailSignIn, { flowId: flow.flowId })

      const receipt = yield* browser.call(AuthenticationApi.actions.requestEmailCode, {
        ...flow,
        requestId: crypto.randomUUID(),
        locale: "pt",
      })

      // Delivery may finish on another fiber.
      const message = yield* Effect.suspend(() => {
        const delivered = deliveries.slice(sent).find((candidate) => candidate.to === email)
        return delivered === undefined
          ? Effect.fail(new SignInEmailMissingError({ email }))
          : Effect.succeed(delivered)
      }).pipe(
        Effect.retry(Schedule.spaced("5 millis")),
        Effect.timeout("5 seconds"),
        Effect.provideService(Clock.Clock, Clock.Clock.defaultValue()),
      )

      return { flow, reference: receipt.reference, message, code: parseDeliveredCode(message).code }
    })

  /** Redeems a code in `browser`; the response is the auth API's raw reply. */
  const enterCode = ({
    browser,
    pending,
    code = pending.code,
  }: {
    browser: TestBrowser
    pending: Effect.Success<ReturnType<typeof requestCode>>
    code?: string | undefined
  }) =>
    browser.fetchRoute({
      path: AuthenticationApi.actions.completeEmailSignIn.route.path,
      method: "POST",
      body: { payload: { ...pending.flow, reference: pending.reference, secret: code } },
    })

  /** Signs in with the email-code flow and returns the browser carrying the session cookie. */
  const signInBrowser = (email: string) =>
    Effect.gen(function* () {
      const browser = newBrowser()
      const pending = yield* requestCode(browser, email)

      yield* browser.call(AuthenticationApi.actions.completeEmailSignIn, {
        ...pending.flow,
        reference: pending.reference,
        secret: pending.code,
      })

      return browser
    })

  /** Signs in with the email-code flow and returns a typed client carrying the session cookie. */
  const signIn = (email: string) => Effect.flatMap(signInBrowser(email), clientWith)

  /** The email a person signs in with. */
  const emailOf = (personId: PersonId) => Effect.map(findEmail(personId), ({ email }) => email)

  /** Signs in as an existing person, using the email on their account. */
  const signInAs = (personId: PersonId) => Effect.flatMap(emailOf(personId), signIn)

  return {
    visitor,
    signIn,
    signInBrowser,
    signInAs,
    emailOf,
    newBrowser,
    requestCode,
    enterCode,
    clientWith,
    fetchWith,
    requestWith,
  }
})

/** One in-process app per scenario: the layer owns its lifetime. */
export class ApiTestClient extends Context.Service<ApiTestClient>()("test/ApiTestClient", {
  make: makeApiTestClient,
}) {
  static readonly layer = Layer.effect(ApiTestClient, ApiTestClient.make)
}
