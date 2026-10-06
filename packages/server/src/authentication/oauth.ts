import {
  AuthenticationClaims,
  AuthSubjectId,
  OAuthBeginPayload,
  OAuthCompletePayload,
  OAuthLoginFailure,
  OAuthLoginRejected,
  authenticationNamespace,
} from "@gororobas/domain"
import { Auth, Operations, Proofs, Schema as AuthSchema, Sessions, WebCrypto } from "@yielded/auth"
import { ByteSize, Crypto as EffectCrypto, DateTime, Effect, Layer, Schema } from "effect"
import { HttpIncomingMessage, HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/http"

import { consumeOAuthFlow, insertOAuthFlow } from "./mutations.js"
import { OAuthProtocol } from "./oauth-protocol.js"
import { provisionOAuthAccount } from "./oauth-storage.js"

const binding = Operations.makeRequestBinding(authenticationNamespace, "oauth")

const sessions = Sessions.make(AuthenticationClaims, {
  namespace: `${authenticationNamespace}/sessions`,
})

const BeginOAuth = Operations.makeOperation(`${authenticationNamespace}/oauth/begin`, {
  payload: OAuthBeginPayload,
  success: Schema.Struct({ authorizationUrl: Schema.String }),
  error: OAuthLoginFailure,
  access: "any",
  exposure: "public",
  replay: "non-idempotent",
  credentials: true,
})

const CompleteOAuth = Operations.makeOperation(`${authenticationNamespace}/oauth/complete`, {
  payload: Schema.Struct({
    ...OAuthCompletePayload.fields,
    requestBinding: Operations.RequestBindingCredential,
  }),
  success: sessions.CompletionResult,
  error: OAuthLoginFailure,
  access: "any",
  exposure: "public",
  replay: "single-use",
  credentials: true,
})

const invalidFlow = () => OAuthLoginRejected.make({ reason: "invalid-flow" })

const handlers = Layer.mergeAll(
  BeginOAuth.credentialHandlerLayer(
    Effect.fn(function* (input, caller) {
      const requestContext = yield* Effect.serviceOption(Proofs.ProofRequestContext)
      if (requestContext._tag === "None") return yield* invalidFlow()
      yield* (yield* Proofs.HostIngressLimiter).check({
        action: "oauth",
        networkKey: (yield* requestContext.value).networkKey,
      })
      const now = DateTime.toEpochMillis(yield* DateTime.now)
      if (
        caller._tag === "Authenticated" &&
        now - DateTime.toEpochMillis(caller.assurance.authenticatedAt) > 300_000
      )
        return yield* invalidFlow()
      const issued = yield* (yield* binding.RequestBinding).issue(input.flowId)
      const command = issued.credentialCommands[0]
      if (command?._tag !== "Issue") return yield* invalidFlow()
      const verified = yield* (yield* binding.RequestBinding).verify(
        input.flowId,
        command.credential,
      )
      const crypto = yield* EffectCrypto.Crypto
      const state = yield* crypto.randomUUIDv4.pipe(Effect.mapError(invalidFlow))
      const nonce = yield* crypto.randomUUIDv4.pipe(Effect.mapError(invalidFlow))
      const pkceVerifier = `${yield* crypto.randomUUIDv4.pipe(Effect.mapError(invalidFlow))}${yield* crypto.randomUUIDv4.pipe(Effect.mapError(invalidFlow))}`
      const authorizationUrl = yield* (yield* OAuthProtocol).authorize({
        provider: input.provider,
        state,
        nonce,
        pkceVerifier,
      })
      const linkAuthSubjectId =
        caller._tag === "Authenticated"
          ? yield* Schema.decodeEffect(AuthSubjectId)(caller.subjectId).pipe(
              Effect.mapError(invalidFlow),
            )
          : null
      yield* insertOAuthFlow({
        state,
        flowId: input.flowId,
        provider: input.provider,
        bindingVerifier: verified.verifier,
        nonce,
        pkceVerifier,
        linkAuthSubjectId,
        expiresAt: Math.min(now + 600_000, verified.expiresAtMillis),
      }).pipe(Effect.mapError(invalidFlow))
      return { value: { authorizationUrl }, credentialCommands: issued.credentialCommands }
    }),
  ),
  CompleteOAuth.credentialHandlerLayer(
    Effect.fn(function* (input, caller) {
      const verified = yield* (yield* binding.RequestBinding).verify(
        input.flowId,
        input.requestBinding,
      )
      const flow = yield* consumeOAuthFlow({
        state: input.state,
        provider: input.provider,
        flowId: input.flowId,
        bindingVerifier: verified.verifier,
      }).pipe(Effect.mapError(invalidFlow))
      if (flow._tag === "None") return yield* invalidFlow()
      const now = yield* DateTime.now
      if (
        flow.value.linkAuthSubjectId !== null &&
        (caller._tag !== "Authenticated" ||
          String(caller.subjectId) !== flow.value.linkAuthSubjectId ||
          DateTime.toEpochMillis(now) - DateTime.toEpochMillis(caller.assurance.authenticatedAt) >
            300_000)
      )
        return yield* invalidFlow()
      // Claim before exchanging the code. A failed exchange requires a new flow.
      const identity = yield* (yield* OAuthProtocol).exchange({ ...flow.value, code: input.code })
      const account = yield* provisionOAuthAccount({
        provider: input.provider,
        identity,
        linkAuthSubjectId: flow.value.linkAuthSubjectId,
      })
      const subjectId = AuthSchema.SubjectId.make(account.authSubjectId)
      const revision = yield* (yield* Sessions.AuthenticationAuthority).capture(subjectId, [
        account.credentialId,
      ])
      const completed = yield* (yield* sessions.AuthenticationCompletion)
        .prepare({
          claims: { authSubjectId: account.authSubjectId },
          evidence: {
            flowId: Sessions.AuthenticationFlowId.make(input.flowId),
            bindingDigest: AuthSchema.TokenDigest.make(verified.verifier),
            revision,
            proofs: [
              {
                method: `oauth:${input.provider}`,
                credentialId: account.credentialId,
                factors: ["possession"],
                userVerified: false,
                phishingResistant: false,
                verifiedAt: now,
              },
            ],
          },
        })
        .pipe(
          Effect.flatMap((commit) => commit.read),
          Effect.mapError(() => Sessions.SessionUnavailable.make({})),
        )
      return {
        value: completed.value,
        credentialCommands: [
          ...completed.credentialCommands,
          { _tag: "Clear" as const, slot: "request-binding" as const },
        ],
      }
    }),
  ),
).pipe(
  Layer.provideMerge(binding.layer),
  Layer.provideMerge(Proofs.HostIngressLimiter.layer()),
  Layer.provide(WebCrypto.layerWebCrypto),
)

export const oauthStrategy = Auth.makeStrategy(
  { beginOAuth: BeginOAuth.invoke, completeOAuth: CompleteOAuth.invoke },
  handlers,
  { completion: true },
)

// The relay does not consume state or establish a session. The first-party page
// completes with the originating browser's binding cookie and CSRF headers.
const relay = (provider: "apple" | "google" | "microsoft") =>
  Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest
    const parameters =
      request.method === "POST"
        ? new URLSearchParams(yield* request.text)
        : new URL(request.url, "https://localhost").searchParams
    const code = parameters.get("code")
    const state = parameters.get("state")
    if (
      code === null ||
      state === null ||
      code.length > 4096 ||
      state.length > 128 ||
      parameters.getAll("code").length !== 1 ||
      parameters.getAll("state").length !== 1
    )
      return HttpServerResponse.redirect("/api/auth/login#oauth-error", {
        headers: { "cache-control": "no-store", "referrer-policy": "no-referrer" },
      })
    return HttpServerResponse.redirect(
      `/api/auth/login#oauth=${encodeURIComponent(JSON.stringify({ provider, code, state }))}`,
      { status: 303, headers: { "cache-control": "no-store", "referrer-policy": "no-referrer" } },
    )
  }).pipe(
    Effect.provideService(HttpIncomingMessage.MaxBodySize, ByteSize.kibibytes(16)),
    Effect.catch(() => Effect.succeed(HttpServerResponse.redirect("/api/auth/login#oauth-error"))),
  )

export const oauthCallbackRoutes = Layer.mergeAll(
  HttpRouter.add("POST", "/api/auth/apple/callback", relay("apple")),
  HttpRouter.add("GET", "/api/auth/google/callback", relay("google")),
  HttpRouter.add("GET", "/api/auth/microsoft/callback", relay("microsoft")),
)
