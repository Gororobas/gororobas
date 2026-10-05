import { DateTime, Effect, Layer, Schema } from "effect";

import { makeAuthStrategy } from "../auth/AuthStrategy";
import { cryptoLayer, defaultLayer, hooksLayer } from "../auth/defaults";
import { hasCommitScope } from "../hooks/commit";
import { LifecycleHooks } from "../hooks/LifecycleHooks";
import { lifecycleEvent, lifecycleSnapshot, LifecycleEventId } from "../hooks/models";
import { LoginIdentifier } from "../identity/models";
import type { AuthInvocation } from "../operations/context";
import { makeOperation, operationGroup } from "../operations/operation";
import {
  makeRequestBinding,
  RequestBindingCredential,
  RequestBindingFlowId,
} from "../operations/requestBinding";
import { readProofCommit } from "../proofs/dispatch";
import {
  ProofBinding,
  ProofPurpose,
  ProofRequestId,
  ProofRequestReceipt,
  ProofReference,
  ProofCleanupResult,
} from "../proofs/models";
import { makeProofModule } from "../proofs/module";
import type { ProofPolicy } from "../proofs/policy";
import { defaultProofPolicy } from "../proofs/policy";
import { Locale } from "../Schema";
import { assessAuthentication } from "../sessions/assurance";
import { AuthenticationAuthority } from "../sessions/AuthenticationAuthority";
import { SessionInvalidationWindow, sessionInvalidationWindow } from "../sessions/invalidation";
import {
  AuthenticationFlowId,
  AuthenticationRequirement,
  type AuthenticationEvidence,
} from "../sessions/models";
import type { makeSessionModule } from "../sessions/module";
import { phoneAdmission, phoneDigest, phoneAttemptAdmission } from "./admission";
import { makePhoneClaims } from "./claims";
import { deliveryLayer } from "./delivery";
import { phoneFailure, phoneActionFailure } from "./failure";
import {
  PhoneActionChallenge,
  PhoneActionRequired,
  PhoneCommandId,
  PhoneConfigurationError,
  PhoneLifecycleAction,
  PhoneLifecycleFailure,
  PhoneLifecyclePolicy,
  type PhoneActionAuthorization,
} from "./lifecycleModels";
import { PhoneNumber, PhoneOtpRejected, PhoneOtpUnavailable } from "./models";
import { PhoneActionEvidence } from "./PhoneActionEvidence";
import { PhoneAdmission } from "./PhoneAdmission";
import { PhoneDeliveryEligibility } from "./PhoneDeliveryEligibility";
import { PhonePersistence } from "./PhonePersistence";
const Code = Schema.RedactedFromValue(Schema.String.check(Schema.isPattern(/^[0-9]{6,10}$/)));
const ActionProof = Schema.RedactedFromValue(Schema.String.check(Schema.isMaxLength(4096)));

const fields = {
  action: PhoneLifecycleAction,
  flowId: RequestBindingFlowId,
  commandId: PhoneCommandId,
  phoneNumber: PhoneNumber,
  sourcePhoneNumber: Schema.optionalKey(PhoneNumber),
};

const Start = Schema.Struct({
  ...fields,
  requestId: ProofRequestId,
  locale: Locale,
});

const Bound = Schema.Struct({ ...fields, requestBinding: RequestBindingCredential });

const ResendInput = Schema.Struct({
  ...Start.fields,
  requestBinding: RequestBindingCredential,
  reference: ProofReference,
});

const CompleteInput = Schema.Struct({
  ...Bound.fields,
  reference: ProofReference,
  code: Code,
  actionProof: Schema.optionalKey(ActionProof),
});

const Challenge = Schema.Struct({
  ...ProofRequestReceipt.fields,
  flowId: RequestBindingFlowId,
  actionChallenge: Schema.NullOr(PhoneActionChallenge),
});

export const defaultPhoneLifecyclePolicy: PhoneLifecyclePolicy = {
  maximumEvidenceAgeMillis: 300_000,
  requireImmediateInvalidation: false,
};

export const makePhoneLifecycle = <
  const Id extends string,
  const SessionId extends string,
  Claims extends Schema.Codec<unknown, unknown, unknown, unknown>,
>(
  moduleId: Id,
  options: {
    readonly sessions: ReturnType<typeof makeSessionModule<SessionId, Claims>>;
    readonly policy?: ProofPolicy;
    readonly digits?: 6 | 7 | 8 | 9 | 10;
    readonly lifecycle?: PhoneLifecyclePolicy;
  },
) => {
  const SessionClaims = makePhoneClaims<Id, Claims>(moduleId);

  const { sessions } = options,
    policy = Object.freeze({ ...(options.lifecycle ?? defaultPhoneLifecyclePolicy) }),
    binding = makeRequestBinding(moduleId, "phone-lifecycle");

  const proof = makeProofModule(`${moduleId}/lifecycle`, {
    purpose: ProofPurpose.make("phone-lifecycle"),
    binding: ProofBinding,
    channel: "sms",
    template: "phone-lifecycle",
    secret: { _tag: "NumericCode", digits: options.digits ?? 6 },
    policy: options.policy ?? defaultProofPolicy,
  });

  const Result = Schema.Union([
    Schema.TaggedStruct("Registered", { completion: sessions.CompletionResult }),
    Schema.TaggedStruct("Updated", { invalidation: SessionInvalidationWindow }),
  ]);

  const admitRequest = Effect.fn("PhoneLifecycle.admitRequest")(function* (
    input: typeof Start.Type & { readonly reference?: typeof ProofReference.Type },
  ) {
    if (
      !(yield* phoneAdmission(
        moduleId,
        "request",
        input.requestId,
        yield* phoneDigest([
          "lifecycle",
          input.action,
          input.flowId,
          input.commandId,
          input.phoneNumber,
          input.sourcePhoneNumber ?? "",
          input.locale,
          input.reference?.proofId ?? "",
        ]),
        (options.policy ?? defaultProofPolicy).requestRetentionMillis,
      ))
    )
      return yield* PhoneOtpRejected.make({});
  });

  const Begin = makeOperation(`${moduleId}/begin`, {
    payload: Start,
    authorize: admitRequest,
    success: Challenge,
    error: PhoneLifecycleFailure,
    access: "any",
    exposure: "public",
    replay: "non-idempotent",
    credentials: true,
  });

  const Resend = makeOperation(`${moduleId}/resend`, {
    payload: ResendInput,
    authorize: admitRequest,
    success: Challenge,
    error: PhoneLifecycleFailure,
    access: "any",
    exposure: "public",
    replay: "idempotent",
    credentials: true,
  });

  const CompleteLifecycle = makeOperation(`${moduleId}/complete-lifecycle`, {
    payload: CompleteInput,
    authorize: (input) => phoneAttemptAdmission(moduleId, input.flowId, input.reference.proofId),
    success: Result,
    error: PhoneLifecycleFailure,
    access: "any",
    exposure: "public",
    replay: "single-use",
    credentials: true,
  });

  const Cancel = makeOperation(`${moduleId}/cancel-lifecycle`, {
    payload: Bound,
    success: Schema.Void,
    error: PhoneLifecycleFailure,
    access: "any",
    exposure: "public",
    replay: "idempotent",
    credentials: true,
  });

  const Cleanup = makeOperation(`${moduleId}/cleanup-lifecycle`, {
    payload: Schema.Struct({
      limit: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 1000 })),
      after: Schema.optionalKey(Schema.NonEmptyString.check(Schema.isMaxLength(256))),
    }),
    success: Schema.Struct({
      proofs: ProofCleanupResult,
      admission: Schema.Struct({
        deleted: Schema.Natural,
        nextCursor: Schema.NullOr(Schema.String),
      }),
    }),
    error: PhoneLifecycleFailure,
    access: "system",
    exposure: "internal",
    replay: "idempotent",
  });

  const noAmbient = Effect.gen(function* () {
    if (yield* hasCommitScope) return yield* PhoneOtpUnavailable.make({});
    yield* Schema.decodeEffect(PhoneLifecyclePolicy)(policy).pipe(
      Effect.mapError(() => PhoneConfigurationError.make({})),
    );
  });

  const capture = Effect.fn("PhoneLifecycle.capture")(function* (
    input: typeof Bound.Type,
    invocation: AuthInvocation,
  ) {
    yield* noAmbient;
    if (
      input.action === "register"
        ? invocation._tag !== "Guest" || input.sourcePhoneNumber !== undefined
        : invocation._tag !== "Authenticated" ||
          (input.action === "change"
            ? input.sourcePhoneNumber === undefined
            : input.sourcePhoneNumber !== undefined)
    )
      return yield* PhoneOtpRejected.make({});

    const verified = yield* (yield* binding.RequestBinding)
      .verify(input.flowId, input.requestBinding)
      .pipe(Effect.mapError(phoneFailure));

    const target = yield* (yield* PhonePersistence).target({
      moduleId,
      action: input.action,
      phoneNumber: input.phoneNumber,
      ...(invocation._tag === "Authenticated" ? { subjectId: invocation.subjectId } : {}),
      ...(input.sourcePhoneNumber === undefined
        ? {}
        : { sourcePhoneNumber: input.sourcePhoneNumber }),
    });

    const contextDigest = yield* phoneDigest([
      "effect-auth/phone-lifecycle/v1",
      moduleId,
      input.action,
      input.flowId,
      input.commandId,
      verified.verifier,
      input.phoneNumber,
      input.sourcePhoneNumber ?? "",
      target.custody?.custodyRevision ?? "",
      target.source?.custodyRevision ?? "",
      target.revision?.subjectId ?? "",
      target.revision?.securityRevision ?? "",
    ]);

    const base = {
      flowId: input.flowId,
      contextDigest,
      identifier: LoginIdentifier.make({ namespace: "phone", value: input.phoneNumber }),
    };

    const proofBinding: ProofBinding =
      target.revision === null || input.action === "register"
        ? { _tag: "Identifier", ...base }
        : {
            _tag: input.action === "change" ? "IdentifierChange" : "Subject",
            ...base,
            revision: target.revision,
          };

    const challenge: PhoneActionChallenge | null =
      input.action === "register" || target.revision === null
        ? null
        : {
            moduleId,
            action: input.action,
            commandId: input.commandId,
            flowId: AuthenticationFlowId.make(input.flowId),
            phoneNumber: input.phoneNumber,
            ...(input.sourcePhoneNumber === undefined
              ? {}
              : { sourcePhoneNumber: input.sourcePhoneNumber }),
            revision: target.revision,
            bindingDigest: contextDigest,
          };

    return { target, binding: proofBinding, challenge };
  });

  const request = Effect.fn("PhoneLifecycle.request")(function* (
    input: typeof Start.Type,
    invocation: AuthInvocation,
    credential: typeof RequestBindingCredential.Type,
    supersedes?: typeof ProofReference.Type,
  ) {
    const current = yield* capture({ ...input, requestBinding: credential }, invocation);
    const allowed = yield* (yield* PhoneDeliveryEligibility).allowed(input.phoneNumber);

    const dispatch = yield* (yield* proof.Proofs)
      .prepareIssue({
        requestId: input.requestId,
        binding: current.binding,
        locale: input.locale,
        eligible: current.target.eligible && allowed,
        ...(supersedes === undefined ? {} : { supersedes: supersedes.proofId }),
      })
      .pipe(Effect.flatMap(readProofCommit), Effect.mapError(phoneFailure));

    yield* dispatch.schedule.pipe(Effect.mapError(phoneFailure));

    return { ...dispatch.receipt, flowId: input.flowId, actionChallenge: current.challenge };
  });

  const handlersLayer = Layer.mergeAll(
    Begin.credentialHandlerLayer(
      Effect.fn("PhoneLifecycle.begin")(function* (input, invocation) {
        yield* noAmbient;

        const issued = yield* (yield* binding.RequestBinding)
          .issue(input.flowId)
          .pipe(Effect.mapError(phoneFailure));

        const credential = issued.credentialCommands.find(
          (c) => c._tag === "Issue" && c.slot === "request-binding",
        );

        if (credential?._tag !== "Issue") return yield* PhoneOtpUnavailable.make({});

        return {
          value: yield* request(input, invocation, credential.credential),
          credentialCommands: issued.credentialCommands,
        };
      }),
    ),
    Resend.credentialHandlerLayer(
      Effect.fn("PhoneLifecycle.resend")(function* (input, invocation) {
        return {
          value: yield* request(input, invocation, input.requestBinding, input.reference),
          credentialCommands: [],
        };
      }),
    ),
    CompleteLifecycle.credentialHandlerLayer(
      Effect.fn("PhoneLifecycle.complete")(function* (input, invocation) {
        const current = yield* capture(input, invocation);
        const strategy = yield* sessions.SessionStrategy;

        if (
          policy.requireImmediateInvalidation &&
          strategy.capabilities.subjectInvalidation !== "immediate"
        )
          return yield* PhoneConfigurationError.make({});

        const proofs = yield* proof.Proofs,
          attempted = yield* proofs
            .prepareAttempt({
              binding: current.binding,
              reference: input.reference,
              credential: input.code,
            })
            .pipe(Effect.flatMap(readProofCommit), Effect.mapError(phoneFailure));

        if (attempted.value._tag !== "Accepted" || !current.target.eligible)
          return yield* PhoneOtpRejected.make({});

        const continuation = attempted.credentialCommands.find(
          (c) => c._tag === "Issue" && c.slot === "proof-continuation",
        );

        if (continuation?._tag !== "Issue") return yield* PhoneOtpUnavailable.make({});
        let authorization: PhoneActionAuthorization | undefined;

        if (input.action !== "register") {
          if (current.challenge === null) return yield* PhoneActionRequired.make({});

          const verified = yield* (yield* PhoneActionEvidence).verify({
            invocation,
            challenge: current.challenge,
            ...(input.actionProof === undefined ? {} : { proof: input.actionProof }),
          });

          const evidence = verified.evidence;

          const actionRequirement = yield* Schema.decodeEffect(
            Schema.toCodecIso(AuthenticationRequirement),
          )(
            Schema.encodeSync(Schema.toCodecIso(AuthenticationRequirement))(verified.requirement),
          ).pipe(Effect.mapError(phoneActionFailure));

          if (
            evidence.flowId !== current.challenge.flowId ||
            evidence.bindingDigest !== current.challenge.bindingDigest ||
            evidence.revision.subjectId !== current.challenge.revision.subjectId ||
            evidence.revision.securityRevision !== current.challenge.revision.securityRevision
          )
            return yield* PhoneActionRequired.make({});

          const requirement = yield* (yield* AuthenticationAuthority)
            .requirements(evidence)
            .pipe(Effect.mapError(phoneActionFailure));

          const assessment = yield* assessAuthentication(evidence, {
            ...requirement,
            maximumAgeMillis: Math.min(
              policy.maximumEvidenceAgeMillis,
              requirement.maximumAgeMillis,
            ),
          }).pipe(Effect.mapError(phoneActionFailure));

          if (!assessment.satisfied) return yield* PhoneActionRequired.make({});

          const actionAssessment = yield* assessAuthentication(evidence, {
            ...actionRequirement,
            maximumAgeMillis: Math.min(
              policy.maximumEvidenceAgeMillis,
              actionRequirement.maximumAgeMillis,
            ),
          }).pipe(Effect.mapError(phoneActionFailure));

          if (!actionAssessment.satisfied) return yield* PhoneActionRequired.make({});
          authorization = {
            challenge: current.challenge,
            evidence,
            requirement,
            actionRequirement,
          };
        }

        const completion = yield* proofs
            .planComplete({
              binding: current.binding,
              continuationId: attempted.value.continuation.continuationId,
              credential: continuation.credential,
            })
            .pipe(Effect.mapError(phoneFailure)),
          now = yield* DateTime.now,
          hooks = yield* LifecycleHooks;

        const snapshot = lifecycleSnapshot({
          action: input.action === "register" ? "registration" : "identifier-change",
          operation: `${moduleId}/${input.action}`,
          method: "phone-otp",
          identifiers: [current.binding.identifier],
          ...(current.target.revision === null
            ? {}
            : { subjectId: current.target.revision.subjectId }),
        });

        yield* hooks.before(snapshot);

        const decision = yield* (yield* PhonePersistence)
          .mutate(
            {
              moduleId,
              action: input.action,
              commandId: input.commandId,
              target: current.target,
              policy,
              completion,
              ...(authorization === undefined ? {} : { authorization }),
            },
            (decision, journal) => {
              if (decision._tag === "Accepted")
                journal.stage(
                  lifecycleEvent({
                    id: LifecycleEventId.make(`phone/${moduleId}/${input.commandId}`),
                    occurredAtMillis: now.epochMilliseconds,
                    snapshot: { ...snapshot, subjectId: decision.credential.revision.subjectId },
                  }),
                );

              return journal.prepare(decision);
            },
          )
          .pipe(
            Effect.flatMap((receipt) => receipt.read),
            Effect.mapError(phoneFailure),
          );

        if (decision._tag !== "Accepted") return yield* PhoneOtpRejected.make({});
        if (input.action !== "register")
          return {
            value: {
              _tag: "Updated" as const,
              invalidation: sessionInvalidationWindow(
                "identifier-change",
                strategy.capabilities,
                strategy.policy,
              ),
            },
            credentialCommands: [{ _tag: "Clear" as const, slot: "request-binding" as const }],
          };

        const credential = decision.credential,
          evidence: AuthenticationEvidence = {
            flowId: AuthenticationFlowId.make(input.flowId),
            bindingDigest: current.binding.contextDigest,
            revision: credential.revision,
            proofs: [
              {
                method: "phone-otp",
                credentialId: credential.credentialId,
                factors: ["possession"],
                userVerified: false,
                phishingResistant: false,
                verifiedAt: now,
              },
            ],
          };

        const claims = yield* (yield* SessionClaims).resolve({
          subjectId: credential.revision.subjectId,
          credential,
        });

        const established = yield* (yield* sessions.AuthenticationCompletion)
          .prepare({ evidence, claims })
          .pipe(
            Effect.flatMap((receipt) => receipt.read),
            Effect.mapError(phoneFailure),
          );

        return {
          value: { _tag: "Registered" as const, completion: established.value },
          credentialCommands: [
            ...established.credentialCommands,
            { _tag: "Clear" as const, slot: "request-binding" as const },
          ],
        };
      }),
    ),
    Cancel.credentialHandlerLayer(
      Effect.fn("PhoneLifecycle.cancel")(function* (input, invocation) {
        const current = yield* capture(input, invocation);

        yield* (yield* proof.Proofs)
          .cancel(current.binding)
          .pipe(Effect.flatMap(readProofCommit), Effect.mapError(phoneFailure));

        return {
          value: undefined,
          credentialCommands: [{ _tag: "Clear" as const, slot: "request-binding" as const }],
        };
      }),
    ),
    Cleanup.handlerLayer(
      Effect.fn("PhoneLifecycle.cleanup")(function* (input) {
        yield* noAmbient;

        const proofResult = yield* (yield* proof.Proofs)
          .cleanup(input.limit)
          .pipe(Effect.flatMap(readProofCommit), Effect.mapError(phoneFailure));

        const admission = yield* (yield* PhoneAdmission).cleanup({
          moduleId,
          limit: input.limit,
          ...(input.after === undefined ? {} : { after: input.after }),
        });

        return { proofs: proofResult, admission };
      }),
    ),
  );

  const layer = handlersLayer.pipe(
    Layer.provide(defaultLayer(binding.RequestBinding, binding.layer)),
    Layer.provide(defaultLayer(proof.Proofs, proof.smsLayer.pipe(Layer.provide(deliveryLayer)))),
    Layer.provide([cryptoLayer, hooksLayer]),
  );

  const methods = {
    begin: Begin.invoke,
    resend: Resend.invoke,
    completeLifecycle: CompleteLifecycle.invoke,
    cancelLifecycle: Cancel.invoke,
    cleanupLifecycle: Cleanup.invoke,
  };

  return Object.freeze({
    SessionClaims,
    binding,
    proof,
    Result,
    layer,
    handlersLayer,
    operations: { Begin, Resend, CompleteLifecycle, Cancel, Cleanup },
    group: operationGroup(Begin, Resend, CompleteLifecycle, Cancel, Cleanup),
    strategy: makeAuthStrategy(
      methods,
      layer.pipe(
        Layer.provideMerge(cryptoLayer),
        Layer.merge(Layer.effect(PhoneAdmission, PhoneAdmission)),
      ),
      { completion: true },
    ),
  });
};
