import { Crypto, DateTime, Effect, Layer, Option, Schema } from "effect";
import { Base64Url } from "effect/encoding";

import { makeAuthStrategy } from "../auth/AuthStrategy";
import { cryptoLayer, defaultLayer, hooksLayer } from "../auth/defaults";
import { hasCommitScope } from "../hooks/commit";
import { HookDenied } from "../hooks/models";
import { LoginIdentifier } from "../identity/models";
import type { AuthInvocation } from "../operations/context";
import { makeOperation, operationGroup } from "../operations/operation";
import type { RequestBindingCredential } from "../operations/requestBinding";
import { makeRequestBinding, RequestBindingFlowId } from "../operations/requestBinding";
import { readProofCommit } from "../proofs/dispatch";
import { ProofBinding, ProofPurpose, ProofRequestId, ProofRequestReceipt } from "../proofs/models";
import { makeProofModule } from "../proofs/module";
import type { ProofPolicy } from "../proofs/policy";
import { defaultProofPolicy } from "../proofs/policy";
import { Locale, TokenDigest } from "../Schema";
import { AuthenticationAuthority } from "../sessions/AuthenticationAuthority";
import {
  AuthenticationFlowId,
  AuthenticationRevision,
  type AuthenticationEvidence,
} from "../sessions/models";
import type { makeSessionModule } from "../sessions/module";
import { phoneAdmission, phoneDigest, phoneAttemptAdmission } from "./admission";
import { makePhoneClaims } from "./claims";
import { deliveryLayer } from "./delivery";
import { phoneFailure } from "./failure";
import {
  PhoneCredentialSnapshot,
  PhoneNumber,
  PhoneOtpComplete,
  PhoneOtpRejected,
  PhoneOtpUnavailable,
} from "./models";
import { PhoneAdmission } from "./PhoneAdmission";
import { PhoneDeliveryEligibility } from "./PhoneDeliveryEligibility";
import { PhoneSignInTargets } from "./PhoneSignInTargets";

const Start = Schema.Struct({
  flowId: RequestBindingFlowId,
  requestId: ProofRequestId,
  phoneNumber: PhoneNumber,
  locale: Locale,
});

const Challenge = Schema.Struct({ ...ProofRequestReceipt.fields, flowId: RequestBindingFlowId });
const Failure = Schema.Union([PhoneOtpRejected, PhoneOtpUnavailable, HookDenied]);
const tuple = Schema.fromJsonString(Schema.Array(Schema.String));

const noAmbient = Effect.fn("PhoneOtp.noAmbient")(function* () {
  if (yield* hasCommitScope) return yield* PhoneOtpUnavailable.make({});
});

/** Existing-account SMS sign-in. Verification consumes its proof before session
 * issuance; failure after consumption requires a fresh code. No distributed
 * atomicity or implicit account linking is claimed.
 */
export const makePhoneOtp = <
  const Id extends string,
  const SessionId extends string,
  Claims extends Schema.Codec<unknown, unknown, unknown, unknown>,
>(
  moduleId: Id,
  options: {
    readonly sessions: ReturnType<typeof makeSessionModule<SessionId, Claims>>;
    readonly policy?: ProofPolicy;
    readonly digits?: 6 | 7 | 8 | 9 | 10;
  },
) => {
  const { sessions } = options;
  const binding = makeRequestBinding(moduleId, "phone-otp-sign-in");

  const proof = makeProofModule(`${moduleId}/sign-in`, {
    purpose: ProofPurpose.make("phone-otp-sign-in"),
    binding: ProofBinding,
    channel: "sms",
    template: "phone-otp-sign-in",
    secret: { _tag: "NumericCode", digits: options.digits ?? 6 },
    policy: options.policy ?? defaultProofPolicy,
  });

  const SessionClaims = makePhoneClaims<Id, Claims>(moduleId);

  const capture = Effect.fn("PhoneOtp.capture")(function* (request: {
    readonly flowId: RequestBindingFlowId;
    readonly phoneNumber: PhoneNumber;
    readonly requestBinding: typeof RequestBindingCredential.Type;
  }) {
    const verified = yield* (yield* binding.RequestBinding)
      .verify(request.flowId, request.requestBinding)
      .pipe(Effect.mapError(phoneFailure));

    const candidate = yield* (yield* PhoneSignInTargets).lookup({
      moduleId,
      phoneNumber: request.phoneNumber,
    });

    let target: Option.Option<PhoneCredentialSnapshot> = Option.none();

    if (Option.isSome(candidate)) {
      const codec = Schema.toCodecJson(PhoneCredentialSnapshot);

      const snapshot = yield* Schema.encodeEffect(codec)(candidate.value).pipe(
        Effect.flatMap(Schema.decodeEffect(codec)),
        Effect.mapError(phoneFailure),
      );

      const current = yield* (yield* AuthenticationAuthority)
        .capture(snapshot.revision.subjectId, [snapshot.credentialId])
        .pipe(
          Effect.map(Option.some),
          Effect.catchTag("StaleAuthentication", () => Effect.succeed(Option.none())),
          Effect.mapError(phoneFailure),
        );

      if (Option.isSome(current)) {
        const revision = yield* Schema.encodeEffect(Schema.toCodecJson(AuthenticationRevision))(
          current.value,
        )
          .pipe(Effect.flatMap(Schema.decodeEffect(Schema.toCodecJson(AuthenticationRevision))))
          .pipe(Effect.mapError(phoneFailure));

        if (
          snapshot.moduleId === moduleId &&
          snapshot.phoneNumber === request.phoneNumber &&
          snapshot.verifiedAtMillis <= DateTime.toEpochMillis(yield* DateTime.now) &&
          revision.subjectId === snapshot.revision.subjectId &&
          revision.securityRevision === snapshot.revision.securityRevision &&
          revision.credentials.some(
            (value) =>
              value.credentialId === snapshot.credentialId &&
              value.revision === snapshot.credentialRevision,
          )
        )
          target = Option.some({ ...snapshot, revision });
      }
    }

    const encoded = yield* Schema.encodeEffect(tuple)([
      "effect-auth/phone-otp-sign-in/v1",
      moduleId,
      request.flowId,
      verified.verifier,
      request.phoneNumber,
      Option.isSome(target) ? target.value.custodyRevision : "",
    ]).pipe(Effect.mapError(phoneFailure));

    const digest = yield* (yield* Crypto.Crypto)
      .digest("SHA-256", new TextEncoder().encode(encoded))
      .pipe(Effect.mapError(phoneFailure));

    const base = {
      flowId: request.flowId,
      contextDigest: TokenDigest.make(Base64Url.encode(digest)),
      identifier: LoginIdentifier.make({ namespace: "phone", value: request.phoneNumber }),
    };

    const proofBinding: ProofBinding = Option.isSome(target)
      ? { _tag: "Subject", ...base, revision: target.value.revision }
      : { _tag: "Identifier", ...base };

    return { target, binding: proofBinding };
  });

  const admitSignIn = Effect.fn("PhoneOtp.admitRequest")(function* (input: typeof Start.Type) {
    if (
      !(yield* phoneAdmission(
        moduleId,
        "request",
        input.requestId,
        yield* phoneDigest(["sign-in", input.flowId, input.phoneNumber, input.locale]),
        options.policy?.requestRetentionMillis ?? defaultProofPolicy.requestRetentionMillis,
      ))
    )
      return yield* PhoneOtpRejected.make({});
  });

  const SignIn = makeOperation(`${moduleId}/sign-in`, {
    payload: Start,
    authorize: admitSignIn,
    success: Challenge,
    error: Failure,
    access: "any",
    exposure: "public",
    replay: "non-idempotent",
    credentials: true,
  });

  const Complete = makeOperation(`${moduleId}/complete`, {
    payload: PhoneOtpComplete,
    authorize: (input) => phoneAttemptAdmission(moduleId, input.flowId, input.reference.proofId),
    success: sessions.CompletionResult,
    error: Failure,
    access: "any",
    exposure: "public",
    replay: "single-use",
    credentials: true,
  });

  const handlersLayer = Layer.mergeAll(
    SignIn.credentialHandlerLayer(
      Effect.fn("PhoneOtp.signIn")(function* (input, invocation) {
        yield* noAmbient();
        if (invocation._tag !== "Guest") return yield* PhoneOtpRejected.make({});

        const issued = yield* (yield* binding.RequestBinding)
          .issue(input.flowId)
          .pipe(Effect.mapError(phoneFailure));

        const credential = issued.credentialCommands.find(
          (command) => command._tag === "Issue" && command.slot === "request-binding",
        );

        if (credential?._tag !== "Issue") return yield* PhoneOtpUnavailable.make({});
        const current = yield* capture({ ...input, requestBinding: credential.credential });
        const eligible = yield* (yield* PhoneDeliveryEligibility).allowed(input.phoneNumber);

        const dispatch = yield* (yield* proof.Proofs)
          .prepareIssue({
            requestId: input.requestId,
            binding: current.binding,
            locale: input.locale,
            eligible: Option.isSome(current.target) && eligible,
          })
          .pipe(Effect.flatMap(readProofCommit), Effect.mapError(phoneFailure));

        yield* dispatch.schedule.pipe(Effect.mapError(phoneFailure));

        return {
          value: { ...dispatch.receipt, flowId: input.flowId },
          credentialCommands: issued.credentialCommands,
        };
      }),
    ),
    Complete.credentialHandlerLayer(
      Effect.fn("PhoneOtp.completeSignIn")(function* (input, invocation) {
        yield* noAmbient();
        if (invocation._tag !== "Guest") return yield* PhoneOtpRejected.make({});
        const current = yield* capture(input);
        const verifiedAt = yield* DateTime.now;
        const proofs = yield* proof.Proofs;

        const attempted = yield* proofs
          .prepareAttempt({
            binding: current.binding,
            reference: input.reference,
            credential: input.code,
          })
          .pipe(Effect.flatMap(readProofCommit), Effect.mapError(phoneFailure));

        if (attempted.value._tag !== "Accepted" || Option.isNone(current.target))
          return yield* PhoneOtpRejected.make({});

        const continuation = attempted.credentialCommands.find(
          (command) => command._tag === "Issue" && command.slot === "proof-continuation",
        );

        if (continuation?._tag !== "Issue") return yield* PhoneOtpUnavailable.make({});

        const consumed = yield* proofs
          .prepareComplete({
            binding: current.binding,
            continuationId: attempted.value.continuation.continuationId,
            credential: continuation.credential,
          })
          .pipe(Effect.flatMap(readProofCommit), Effect.mapError(phoneFailure));

        if (consumed !== "completed") return yield* PhoneOtpRejected.make({});

        const evidence: AuthenticationEvidence = {
          flowId: AuthenticationFlowId.make(input.flowId),
          bindingDigest: current.binding.contextDigest,
          revision: current.target.value.revision,
          proofs: [
            {
              method: "phone-otp",
              credentialId: current.target.value.credentialId,
              factors: ["possession"],
              userVerified: false,
              phishingResistant: false,
              verifiedAt,
            },
          ],
        };

        const claimCredential = yield* Schema.encodeEffect(
          Schema.toCodecJson(PhoneCredentialSnapshot),
        )(current.target.value).pipe(
          Effect.flatMap(Schema.decodeEffect(Schema.toCodecJson(PhoneCredentialSnapshot))),
          Effect.mapError(phoneFailure),
        );

        const claims = yield* (yield* SessionClaims).resolve({
          subjectId: claimCredential.revision.subjectId,
          credential: claimCredential,
        });

        const established = yield* (yield* sessions.AuthenticationCompletion)
          .prepare({ evidence, claims })
          .pipe(
            Effect.flatMap((receipt) => receipt.read),
            Effect.mapError(phoneFailure),
          );

        return {
          value: established.value,
          credentialCommands: [
            ...established.credentialCommands,
            { _tag: "Clear" as const, slot: "request-binding" as const },
          ],
        };
      }),
    ),
  );

  const layer = handlersLayer.pipe(
    Layer.provide(defaultLayer(binding.RequestBinding, binding.layer)),
    Layer.provide(defaultLayer(proof.Proofs, proof.smsLayer.pipe(Layer.provide(deliveryLayer)))),
    Layer.provide([cryptoLayer, hooksLayer]),
  );

  return Object.freeze({
    persistence: { kind: "phone" as const, moduleId, lifecycle: false as const },
    SessionClaims,
    binding,
    proof,
    layer,
    handlersLayer,
    operations: { SignIn, Complete },
    group: operationGroup(SignIn, Complete),
    strategy: makeAuthStrategy(
      {
        signIn: Effect.fn("PhoneOtp.signInRequest")(function* (
          invocation: AuthInvocation,
          input: { readonly phoneNumber: string; readonly locale?: string },
        ) {
          const crypto = yield* Crypto.Crypto;
          const flowId = yield* crypto.randomUUIDv4.pipe(Effect.mapError(phoneFailure));
          const requestId = yield* crypto.randomUUIDv4.pipe(Effect.mapError(phoneFailure));

          return yield* SignIn.invoke(invocation, {
            ...input,
            flowId,
            requestId,
            locale: input.locale ?? "en",
          });
        }),
        completeSignIn: Complete.invoke,
      },
      layer.pipe(
        Layer.provideMerge(cryptoLayer),
        Layer.merge(Layer.effect(PhoneAdmission, PhoneAdmission)),
      ),
      { completion: true },
    ),
  });
};
