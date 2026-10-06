import {
  AuthenticationClaims,
  MagicLinkFailure,
  MagicLinkIdentity,
  authenticationNamespace,
} from "@gororobas/domain"
import {
  Auth,
  Hooks,
  Identity,
  Operations,
  Proofs,
  Schema as AuthSchema,
  Sessions,
  WebCrypto,
} from "@yielded/auth"
import {
  Context,
  Crypto as EffectCrypto,
  DateTime,
  Effect,
  Layer,
  Option,
  Redacted,
  Schema,
  Predicate,
} from "effect"
import { Base64Url } from "effect/encoding"

import { provisionMagicLinkAccount } from "./auth-subjects.js"
const binding = Operations.makeRequestBinding(authenticationNamespace, "magic-link")
const sessions = Sessions.make(AuthenticationClaims, {
  namespace: `${authenticationNamespace}/sessions`,
})
const identityFields = {
  ...MagicLinkIdentity.fields,
  requestBinding: Operations.RequestBindingCredential,
}

const Begin = Operations.makeOperation(`${authenticationNamespace}/magic-link/begin`, {
  payload: Schema.Struct({
    flowId: Operations.RequestBindingFlowId,
  }),
  success: Operations.RequestBindingPublic,
  error: MagicLinkFailure,
  access: "any",
  exposure: "public",
  replay: "non-idempotent",
  credentials: true,
})

const Request = Operations.makeOperation(`${authenticationNamespace}/magic-link/request`, {
  payload: Schema.Struct({
    ...identityFields,
    requestId: Proofs.ProofRequestId,
    locale: AuthSchema.Locale,
  }),
  success: Proofs.ProofRequestReceipt,
  error: MagicLinkFailure,
  access: "any",
  exposure: "public",
  replay: "idempotent",
})

const Verify = Operations.makeOperation(`${authenticationNamespace}/magic-link/verify`, {
  payload: Schema.Struct({
    ...identityFields,
    reference: Proofs.ProofReference,
    secret: Schema.RedactedFromValue(Schema.String),
  }),
  success: Schema.Struct({
    continuation: Proofs.ProofContinuation,
  }),
  error: MagicLinkFailure,
  access: "any",
  exposure: "public",
  replay: "single-use",
  credentials: true,
})

const Complete = Operations.makeOperation(`${authenticationNamespace}/magic-link/complete`, {
  payload: Schema.Struct({
    ...identityFields,
    continuationId: Proofs.ProofContinuationId,
    credential: Schema.RedactedFromValue(Schema.String),
  }),
  success: sessions.CompletionResult,
  error: MagicLinkFailure,
  access: "any",
  exposure: "public",
  replay: "single-use",
  credentials: true,
})

const bindIdentity = Effect.fn("MagicLink.bindIdentity")(function* (
  input: typeof MagicLinkIdentity.Type & {
    readonly requestBinding: typeof Operations.RequestBindingCredential.Type
  },
) {
  const verified = yield* (yield* binding.RequestBinding).verify(input.flowId, input.requestBinding)
  const crypto = yield* EffectCrypto.Crypto

  const bytes = yield* crypto
    .digest(
      "SHA-256",
      new TextEncoder().encode(
        Schema.encodeSync(Schema.fromJsonString(Schema.Array(Schema.String)))([
          "gororobas/magic-link/v1",
          input.flowId,
          verified.verifier,
          input.email,
          input.name,
        ]),
      ),
    )
    .pipe(Effect.mapError(() => Proofs.ProofUnavailable.make({})))

  return Proofs.IdentifierProofBinding.make({
    _tag: "Identifier",
    flowId: input.flowId,
    contextDigest: AuthSchema.TokenDigest.make(Base64Url.encode(bytes)),
    identifier: Identity.LoginIdentifier.make({
      namespace: "email",
      value: input.email,
    }),
  })
})

export class AuthenticationOrigin extends Context.Service<AuthenticationOrigin, string>()(
  "AuthenticationOrigin",
) {}

const magicLinkHandlers = (origin: string) => {
  const proofs = Proofs.make({
    namespace: `${authenticationNamespace}/magic-link`,
    purpose: Proofs.ProofPurpose.make("magic-link-sign-in"),
    binding: Proofs.IdentifierProofBinding,
    channel: "email",
    url: `${origin}/api/auth/login`,
    secret: {
      _tag: "Token",
    },
    policy: Proofs.defaultProofPolicy,
  })

  const handlers = Layer.mergeAll(
    Begin.credentialHandlerLayer(
      Effect.fn(function* (input) {
        return yield* (yield* binding.RequestBinding).issue(input.flowId)
      }),
    ),
    Request.handlerLayer(
      Effect.fn(function* (input) {
        const context = yield* Effect.serviceOption(Proofs.ProofRequestContext)
        if (Option.isNone(context)) return yield* Proofs.ProofUnavailable.make({})
        const caller = yield* context.value
        yield* (yield* Proofs.HostIngressLimiter).check({
          action: "magic-link",
          networkKey: caller.networkKey,
        })
        const proofBinding = yield* bindIdentity(input)

        const dispatch = yield* (yield* proofs.Proofs)
          .prepareIssue({
            requestId: input.requestId,
            binding: proofBinding,
            locale: input.locale,
            eligible: true,
          })
          .pipe(Effect.flatMap(Proofs.readProofCommit))

        yield* dispatch.schedule
        return dispatch.receipt
      }),
    ),
    Verify.credentialHandlerLayer(
      Effect.fn(function* (input) {
        const proofBinding = yield* bindIdentity(input)

        const result = yield* (yield* proofs.Proofs)
          .prepareAttempt({
            binding: proofBinding,
            reference: input.reference,
            credential: input.secret,
          })
          .pipe(Effect.flatMap(Proofs.readProofCommit))

        if (!Predicate.isTagged(result.value, "Accepted")) {
          return yield* Proofs.ProofInvalid.make({})
        }

        return {
          value: {
            continuation: result.value.continuation,
          },
          credentialCommands: result.credentialCommands,
        }
      }),
    ),
    Complete.credentialHandlerLayer(
      Effect.fn(function* (input) {
        const proofBinding = yield* bindIdentity(input)
        const verifiedAt = yield* DateTime.now

        const consumed = yield* (yield* proofs.Proofs)
          .prepareComplete({
            binding: proofBinding,
            continuationId: input.continuationId,
            credential: input.credential,
          })
          .pipe(Effect.flatMap(Proofs.readProofCommit))

        if (consumed !== "completed") return yield* Proofs.ProofInvalid.make({})
        // Standalone proof completion burns on downstream failure, matching Yielded's
        // email strategy. Provisioning is transactional; a retry needs a fresh link.
        const authSubjectId = yield* provisionMagicLinkAccount(input)
        const subjectId = AuthSchema.SubjectId.make(authSubjectId)
        const revision = yield* (yield* Sessions.AuthenticationAuthority).capture(subjectId, [
          authSubjectId,
        ])

        const established = yield* (yield* sessions.AuthenticationCompletion)
          .prepare({
            claims: {
              authSubjectId: authSubjectId,
            },
            evidence: {
              flowId: Sessions.AuthenticationFlowId.make(input.flowId),
              bindingDigest: proofBinding.contextDigest,
              revision,
              proofs: [
                {
                  method: "magic-link",
                  credentialId: authSubjectId,
                  factors: ["possession"],
                  userVerified: false,
                  phishingResistant: false,
                  verifiedAt,
                },
              ],
            },
          })
          .pipe(
            Effect.flatMap((commit) => commit.read),
            Effect.mapError(() => Sessions.SessionUnavailable.make({})),
          )

        return {
          value: established.value,
          credentialCommands: [
            ...established.credentialCommands,
            {
              _tag: "Clear" as const,
              slot: "proof-continuation" as const,
            },
            {
              _tag: "Clear" as const,
              slot: "request-binding" as const,
            },
          ],
        }
      }),
    ),
  ).pipe(
    Layer.provideMerge(proofs.emailLayer),
    Layer.provideMerge(binding.layer),
    Layer.provideMerge(Proofs.HostIngressLimiter.layer()),
    Layer.provide(Hooks.LifecycleHooks.empty),
    // Proofs.make currently widens Token to ProofSecretPolicy in its public type.
    // Token proofs do not read these keys; keep the unused fallback independent.
    Layer.provide(
      Layer.effect(
        Proofs.ProofKeys,
        Effect.map(
          Effect.flatMap(EffectCrypto.Crypto, (crypto) => crypto.randomBytes(32)),
          (bytes) => ({
            activeKeyId: "token-fallback",
            keys: [
              {
                id: "token-fallback",
                material: Redacted.make(Base64Url.encode(bytes)),
              },
            ],
          }),
        ),
      ),
    ),
    Layer.provide(WebCrypto.layerWebCrypto),
  )

  return handlers
}

export const magicLinkStrategy = Auth.makeStrategy(
  {
    beginMagicLink: Begin.invoke,
    requestMagicLink: Request.invoke,
    verifyMagicLink: Verify.invoke,
    completeMagicLink: Complete.invoke,
  },
  Layer.unwrap(Effect.map(AuthenticationOrigin, magicLinkHandlers)),
  {
    completion: true,
  },
)
