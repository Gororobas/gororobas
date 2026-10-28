/**
 * Signs in to a running development stack through the real email-code flow, reading the code from
 * Mailpit, and prints the session cookie. Lets agents and scripts call authenticated endpoints
 * with curl without anyone opening a mailbox.
 *
 * pnpm --filter @gororobas/server dev:sign-in community@gororobas.test
 * pnpm --filter @gororobas/server dev:sign-in admin@gororobas.test --api http://localhost:4100 --origin http://localhost:4543
 */
import { NodeRuntime, NodeServices } from "@effect/platform-node"
import { AuthenticationApi, DEFAULT_AUTHENTICATION_RETURN_TARGET } from "@gororobas/domain"
import { Config, Console, Effect, Layer, Option, Record, Schedule, Schema } from "effect"
import { Argument, Command, Flag } from "effect/cli"
import {
  Cookies,
  FetchHttpClient,
  HttpClient,
  HttpClientRequest,
  HttpClientResponse,
} from "effect/http"

class SignInFailedError extends Schema.TaggedError<SignInFailedError>()("SignInFailedError", {
  message: Schema.String,
}) {}

const AuthFailure = Schema.TaggedStruct("Failure", { error: Schema.Json })
const AuthEnvelope = Schema.Union([
  Schema.TaggedStruct("Success", { value: Schema.optionalKey(Schema.Unknown) }),
  AuthFailure,
])

const MailpitSearch = Schema.Struct({
  messages: Schema.Array(Schema.Struct({ ID: Schema.String, Subject: Schema.String })),
})

const SIGN_IN_CODE = /\b(\d{6})\b/

/** Cleared cookies arrive with an empty value; sending them back is rejected as bad credentials. */
const cookieHeader = (cookies: Cookies.Cookies) =>
  Record.toEntries(Cookies.toRecord(cookies))
    .filter(([, value]) => value !== "")
    .map(([name, value]) => `${name}=${value}`)
    .join("; ")

const signIn = (input: { email: string; api: string; origin: string; mailpit: string }) =>
  Effect.gen(function* () {
    const http = yield* HttpClient.HttpClient
    let cookies = Cookies.empty

    const callAuth = <S extends Schema.ConstraintDecoder<unknown, never>>(
      action: {
        readonly route: {
          readonly path: string
          readonly operation: { readonly rpc: { readonly successSchema: S } }
        }
      },
      payload: Schema.JsonObject,
    ) =>
      Effect.gen(function* () {
        const response = yield* http.execute(
          HttpClientRequest.post(`${input.api}${action.route.path}`).pipe(
            HttpClientRequest.setHeaders({
              origin: input.origin,
              "x-effect-auth-csrf": "1",
              cookie: cookieHeader(cookies),
            }),
            HttpClientRequest.bodyJsonUnsafe({ payload }),
          ),
        )

        cookies = Cookies.merge(cookies, response.cookies)

        const envelope = yield* HttpClientResponse.schemaBodyJson(AuthEnvelope)(response)

        if (Schema.is(AuthFailure)(envelope)) {
          const error = yield* Schema.encodeEffect(Schema.fromJsonString(Schema.Json))(
            envelope.error,
          )
          return yield* new SignInFailedError({ message: `${action.route.path} failed: ${error}` })
        }

        // oxlint-disable-next-line custom-lint-rules/no-schema-decode-unknown -- Auth envelopes carry untyped JSON values.
        return yield* Schema.decodeUnknownEffect(action.route.operation.rpc.successSchema)(
          envelope.value,
        )
      })

    const mailpitMessages = http
      .get(`${input.mailpit}/api/v1/search?query=${encodeURIComponent(`to:"${input.email}"`)}`)
      .pipe(Effect.flatMap(HttpClientResponse.schemaBodyJson(MailpitSearch)))

    const flow = {
      flowId: crypto.randomUUID(),
      email: input.email,
      returnTarget: DEFAULT_AUTHENTICATION_RETURN_TARGET,
    }

    const earlierMessageIds = (yield* mailpitMessages).messages.map((message) => message.ID)

    yield* callAuth(AuthenticationApi.actions.beginEmailSignIn, { flowId: flow.flowId })

    const receipt = yield* callAuth(AuthenticationApi.actions.requestEmailCode, {
      ...flow,
      requestId: crypto.randomUUID(),
      locale: "pt",
    })

    const code = yield* mailpitMessages.pipe(
      Effect.flatMap(({ messages }) => {
        const delivered = messages.find((message) => !earlierMessageIds.includes(message.ID))
        const match = delivered === undefined ? null : SIGN_IN_CODE.exec(delivered.Subject)

        return match?.[1] === undefined
          ? Effect.fail(
              new SignInFailedError({ message: `No code reached ${input.email} in Mailpit` }),
            )
          : Effect.succeed(match[1])
      }),
      Effect.retry(Schedule.spaced("250 millis")),
      Effect.timeout("15 seconds"),
    )

    yield* callAuth(AuthenticationApi.actions.completeEmailSignIn, {
      ...flow,
      reference: receipt.reference,
      secret: code,
    })

    return cookieHeader(cookies)
  })

const command = Command.make(
  "dev:sign-in",
  {
    email: Argument.String("email").pipe(
      Argument.withDescription("Account to sign in as, e.g. community@gororobas.test"),
    ),
    api: Flag.String("api").pipe(
      Flag.withDescription("API server origin (default: http://localhost:$API_PORT)"),
      Flag.optional,
    ),
    origin: Flag.String("origin").pipe(
      Flag.withDescription("Web app origin the API trusts (default: $AUTH_ORIGIN)"),
      Flag.optional,
    ),
  },
  ({ email, api, origin }) =>
    Effect.gen(function* () {
      const apiPort = yield* Config.String("API_PORT").pipe(Config.withDefault("4000"))
      const authOrigin = yield* Config.String("AUTH_ORIGIN").pipe(
        Config.withDefault("http://localhost:4443"),
      )
      const mailpit = yield* Config.String("MAILPIT_URL").pipe(
        Config.withDefault("http://localhost:8025"),
      )
      const apiOrigin = Option.getOrElse(api, () => `http://localhost:${apiPort}`)

      const cookie = yield* signIn({
        email,
        api: apiOrigin,
        origin: Option.getOrElse(origin, () => authOrigin),
        mailpit,
      })

      yield* Console.log(cookie)
      yield* Console.error(
        `\nSigned in as ${email}. Example:\n  curl -H 'Cookie: ${cookie}' ${apiOrigin}/people/me/profile`,
      )
    }),
).pipe(
  Command.withDescription("Sign in to a running development stack and print the session cookie"),
)

Command.run(command, { version: "0.0.0" }).pipe(
  Effect.provide(Layer.mergeAll(FetchHttpClient.layer, NodeServices.layer)),
  NodeRuntime.runMain,
)
