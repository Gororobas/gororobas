import { Context, Crypto, DateTime, Effect, Layer, Schema } from "effect";
import { Base64Url } from "effect/encoding";

import { hasCommitScope, type PreparedCommit } from "../hooks/commit";
import { LifecycleHooks } from "../hooks/LifecycleHooks";
import { HookDenied, LifecycleEventId, lifecycleEvent, lifecycleSnapshot } from "../hooks/models";
import { LoginIdentifier } from "../identity/models";
import type { AuthInvocation } from "../operations/context";
import type { AuthOperationResult } from "../operations/credentials";
import { makeOperation, operationGroup } from "../operations/operation";
import type { makeRequestBinding } from "../operations/requestBinding";
import { RequestBindingCredential, RequestBindingFlowId } from "../operations/requestBinding";
import { proofRequestAdmission } from "../proofs/admission";
import { readProofCommit } from "../proofs/dispatch";
import type { ProofBinding } from "../proofs/models";
import {
  ProofContinuation,
  ProofContinuationId,
  ProofId,
  ProofReference,
  ProofRequestId,
  ProofRequestReceipt,
} from "../proofs/models";
import type { makeProofModule } from "../proofs/module";
import { Email, Locale, TokenDigest } from "../Schema";
import { assessAuthentication, snapshotAuthenticationEvidence } from "../sessions/assurance";
import { SessionInvalidationWindow, sessionInvalidationWindow } from "../sessions/invalidation";
import { AuthenticationFlowId } from "../sessions/models";
import type { makeSessionModule } from "../sessions/module";
import { EmailActionEvidence, type EmailActionAuthorization } from "./EmailActionEvidence";
import { EmailAddressPersistence, type EmailAddressTarget } from "./EmailAddressPersistence";
import {
  emailCompletionFailure,
  EmailActionRequired,
  EmailConfigurationError,
  EmailMethodUnsupported,
  EmailRejected,
  EmailUnavailable,
} from "./errors";
import { EmailActionChallenge, EmailCommandId, type EmailAction } from "./models";
import {
  snapshotEmailCredential,
  snapshotEmailRequirement,
  snapshotEmailRevision,
} from "./snapshot";

const BoundedId = Schema.NonEmptyString.check(Schema.isMaxLength(256));
const Secret = Schema.RedactedFromValue(Schema.String.check(Schema.isMaxLength(4096)));

const base = {
  flowId: RequestBindingFlowId,
  requestBinding: RequestBindingCredential,
  commandId: EmailCommandId,
  email: Schema.String.check(Schema.isMaxLength(320)).pipe(Schema.decodeTo(Email)),
  sourceCredentialId: Schema.optionalKey(BoundedId),
  actionProof: Schema.optionalKey(Secret),
};

const BindingInput = Schema.Struct(base);

const RequestInput = Schema.Struct({
  ...base,
  requestId: ProofRequestId,
  locale: Locale,
});

const ResendInput = Schema.Struct({ ...RequestInput.fields, supersedes: ProofId });
const AttemptInput = Schema.Struct({ ...base, reference: ProofReference, secret: Secret });

const CompleteInput = Schema.Struct({
  ...base,
  continuationId: ProofContinuationId,
  credential: Secret,
});

const ChangeRequest = Schema.Struct({ ...RequestInput.fields, sourceCredentialId: BoundedId });
const ChangeResend = Schema.Struct({ ...ResendInput.fields, sourceCredentialId: BoundedId });
const ChangeAttempt = Schema.Struct({ ...AttemptInput.fields, sourceCredentialId: BoundedId });
const ChangeComplete = Schema.Struct({ ...CompleteInput.fields, sourceCredentialId: BoundedId });
const Success = Schema.Struct({ invalidation: Schema.optionalKey(SessionInvalidationWindow) });
const AttemptSuccess = Schema.Struct({ continuation: ProofContinuation });

const Failure = Schema.Union([
  EmailRejected,
  EmailUnavailable,
  EmailActionRequired,
  EmailMethodUnsupported,
  HookDenied,
]);

type Failure = typeof Failure.Type;
const tuple = Schema.fromJsonString(Schema.Array(Schema.String));

const noAmbient = Effect.fn("EmailAddresses.noAmbient")(function* () {
  if (yield* hasCommitScope) return yield* EmailMethodUnsupported.make({});
});

const Configuration = Schema.Struct({
  /** Freshness cap for adding or replacing addresses. Existing-identifier confirmation uses application policy. */
  maximumEvidenceAgeMillis: Schema.Int.check(Schema.isBetween({ minimum: 1000, maximum: 300_000 })),
  requireImmediateInvalidation: Schema.Boolean,
});

export type EmailAddressPolicy = typeof Configuration.Type;

export interface AddressModule<Id extends string> {
  readonly moduleId: Id;
  readonly kind: "addresses";
}

export const makeEmailAddresses = <
  const Id extends string,
  const VerifyId extends string,
  const ChangeId extends string,
  const SessionId extends string,
  Claims extends Schema.Codec<unknown, unknown, unknown, unknown>,
>(
  moduleId: Id,
  binding: ReturnType<typeof makeRequestBinding<Id, "email-entry">>,
  verifyProof: ReturnType<typeof makeProofModule<VerifyId, typeof ProofBinding>>,
  changeProof: ReturnType<typeof makeProofModule<ChangeId, typeof ProofBinding>>,
  sessions: ReturnType<typeof makeSessionModule<SessionId, Claims>>,
  configuration: EmailAddressPolicy,
) => {
  const capturedPolicy = { ...configuration };

  type Result = AuthOperationResult<typeof Success.Type | { readonly _tag: "Rejected" }>;
  type Plan = {
    readonly commit: Effect.Effect<
      PreparedCommit<Result>,
      EmailUnavailable,
      EmailAddressPersistence
    >;
  };

  const Addresses = Context.Service<
    AddressModule<Id>,
    {
      readonly request: (
        action: EmailAction,
        invocation: AuthInvocation,
        input: typeof RequestInput.Type,
        supersedes?: ProofId,
      ) => Effect.Effect<ProofRequestReceipt, Failure>;
      readonly attempt: (
        action: EmailAction,
        invocation: AuthInvocation,
        input: typeof AttemptInput.Type,
      ) => Effect.Effect<AuthOperationResult<typeof AttemptSuccess.Type>, Failure>;
      readonly planComplete: (
        action: EmailAction,
        invocation: AuthInvocation,
        input: typeof CompleteInput.Type,
      ) => Effect.Effect<Plan, Failure>;
      readonly cleanup: (
        limit: number,
      ) => Effect.Effect<{ readonly removed: number; readonly hasMore: boolean }, Failure>;
    }
  >(`effect-auth/email/${moduleId}/Addresses`);

  const layer = Layer.effect(
    Addresses,
    Effect.gen(function* () {
      const policy = yield* Schema.decodeEffect(Configuration)(capturedPolicy).pipe(
        Effect.mapError(() => EmailConfigurationError.make({})),
      );

      const binder = yield* binding.RequestBinding;
      const persistence = yield* EmailAddressPersistence;
      const actionAuthority = yield* EmailActionEvidence;
      const verify = yield* verifyProof.Proofs;
      const change = yield* changeProof.Proofs;
      const strategy = yield* sessions.SessionStrategy;
      const crypto = yield* Crypto.Crypto;
      const hooks = yield* LifecycleHooks;

      const digest = Effect.fn("EmailAddresses.digest")(
        function* (parts: ReadonlyArray<string>) {
          const message = yield* Schema.encodeEffect(tuple)(parts);

          return TokenDigest.make(
            Base64Url.encode(yield* crypto.digest("SHA-256", new TextEncoder().encode(message))),
          );
        },
        Effect.mapError(() => EmailUnavailable.make({})),
      );

      const bound = Effect.fn("EmailAddresses.binding")(function* (
        action: EmailAction,
        invocation: AuthInvocation,
        request: typeof BindingInput.Type,
      ) {
        if (invocation._tag !== "Authenticated") return yield* EmailRejected.make({});
        if (action === "change-address" && request.sourceCredentialId === undefined)
          return yield* EmailRejected.make({});

        const privateBinding = yield* binder
          .verify(request.flowId, request.requestBinding)
          .pipe(
            Effect.mapError((error) =>
              error._tag === "RequestBindingInvalid"
                ? EmailRejected.make({})
                : EmailUnavailable.make({}),
            ),
          );

        const identifier = Object.freeze(
          LoginIdentifier.make({ namespace: "email", value: request.email }),
        );

        const current = yield* persistence.target({
          moduleId,
          subjectId: invocation.subjectId,
          target: identifier,
          ...(request.sourceCredentialId === undefined
            ? {}
            : { sourceCredentialId: request.sourceCredentialId }),
        });

        const captured: EmailAddressTarget = Object.freeze({
          revision: snapshotEmailRevision(current.revision),
          eligible: current.eligible,
          ...(current.targetIdentifierRevision === undefined
            ? {}
            : { targetIdentifierRevision: current.targetIdentifierRevision }),
          ...(current.source === undefined
            ? {}
            : { source: yield* snapshotEmailCredential(current.source) }),
        });

        if (
          !(action === "verify-address" && captured.targetIdentifierRevision !== undefined) &&
          policy.requireImmediateInvalidation &&
          strategy.capabilities.subjectInvalidation !== "immediate"
        )
          return yield* EmailMethodUnsupported.make({});

        if (
          captured.revision.subjectId !== invocation.subjectId ||
          (action === "change-address" &&
            (captured.source === undefined ||
              captured.source.credentialId !== request.sourceCredentialId ||
              captured.source.revision.subjectId !== invocation.subjectId ||
              captured.source.revision.securityRevision !== captured.revision.securityRevision))
        )
          return yield* EmailRejected.make({});

        const actionDigest = yield* digest([
          "effect-auth/email-action/v1",
          moduleId,
          action,
          request.commandId,
          captured.revision.subjectId,
          captured.revision.securityRevision,
          captured.source?.credentialId ?? "",
          captured.source?.identifier.value ?? "",
          identifier.value,
          captured.targetIdentifierRevision ?? "",
          ...[...captured.revision.credentials]
            .sort((a, b) =>
              a.credentialId < b.credentialId ? -1 : a.credentialId > b.credentialId ? 1 : 0,
            )
            .flatMap((item) => [item.credentialId, item.revision]),
        ]);

        const decoded = EmailActionChallenge.make({
          moduleId,
          action,
          commandId: request.commandId,
          revision: captured.revision,
          target: identifier,
          ...(captured.targetIdentifierRevision === undefined
            ? {}
            : { targetIdentifierRevision: captured.targetIdentifierRevision }),
          ...(captured.source === undefined
            ? {}
            : { sourceCredentialId: captured.source.credentialId }),
          bindingDigest: actionDigest,
        });

        const challenge = Object.freeze({
          ...decoded,
          revision: snapshotEmailRevision(decoded.revision),
          target: Object.freeze(LoginIdentifier.make(decoded.target)),
        });

        const contextDigest = yield* digest([
          "effect-auth/email-address-proof/v1",
          moduleId,
          action,
          request.flowId,
          privateBinding.verifier,
          actionDigest,
        ]);

        const proofBinding: ProofBinding = {
          _tag: "IdentifierChange",
          identifier,
          revision: captured.revision,
          flowId: request.flowId,
          contextDigest,
        };

        return { captured, identifier, challenge, binding: proofBinding };
      });

      const authorize = Effect.fn("EmailAddresses.authorize")(function* (
        invocation: AuthInvocation,
        request: typeof BindingInput.Type,
        challenge: EmailActionChallenge,
      ) {
        const grant = yield* actionAuthority.verify({
          invocation,
          challenge,
          ...(request.actionProof === undefined ? {} : { proof: request.actionProof }),
        });

        const raw = yield* snapshotAuthenticationEvidence(grant.evidence).pipe(
          Effect.mapError(() => EmailActionRequired.make({})),
        );

        const evidence = { ...raw, revision: snapshotEmailRevision(raw.revision) };

        if (
          evidence.flowId !== AuthenticationFlowId.make(challenge.commandId) ||
          evidence.bindingDigest !== challenge.bindingDigest ||
          evidence.revision.subjectId !== challenge.revision.subjectId ||
          evidence.revision.securityRevision !== challenge.revision.securityRevision ||
          challenge.revision.credentials.some(
            (expected) =>
              !evidence.revision.credentials.some(
                (actual) =>
                  expected.credentialId === actual.credentialId &&
                  expected.revision === actual.revision,
              ),
          )
        )
          return yield* EmailActionRequired.make({});

        const requirement = yield* snapshotEmailRequirement({
          ...grant.requirement,
          maximumAgeMillis:
            challenge.action === "verify-address" &&
            challenge.targetIdentifierRevision !== undefined
              ? grant.requirement.maximumAgeMillis
              : Math.min(policy.maximumEvidenceAgeMillis, grant.requirement.maximumAgeMillis),
        });

        if (
          !(yield* assessAuthentication(evidence, requirement).pipe(
            Effect.mapError(() => EmailActionRequired.make({})),
          )).satisfied
        )
          return yield* EmailActionRequired.make({});

        return Object.freeze({
          challenge,
          evidence,
          requirement,
        }) satisfies EmailActionAuthorization;
      });

      return Addresses.of({
        request: Effect.fn("EmailAddresses.request")(
          function* (action, invocation, input, supersedes) {
            yield* noAmbient();
            const current = yield* bound(action, invocation, input);

            yield* authorize(invocation, input, current.challenge);
            const proofs = action === "verify-address" ? verify : change;

            const dispatch = yield* proofs
              .prepareIssue({
                requestId: input.requestId,
                binding: current.binding,
                locale: input.locale,
                eligible: current.captured.eligible,
                ...(supersedes === undefined ? {} : { supersedes }),
              })
              .pipe(
                Effect.flatMap(readProofCommit),
                Effect.mapError(() => EmailUnavailable.make({})),
              );

            yield* dispatch.schedule.pipe(Effect.mapError(() => EmailUnavailable.make({})));

            return dispatch.receipt;
          },
        ),
        attempt: Effect.fn("EmailAddresses.attempt")(function* (action, invocation, input) {
          yield* noAmbient();
          const current = yield* bound(action, invocation, input);
          const proofs = action === "verify-address" ? verify : change;

          const result = yield* proofs
            .prepareAttempt({
              reference: input.reference,
              credential: input.secret,
              binding: current.binding,
            })
            .pipe(Effect.flatMap(readProofCommit), Effect.mapError(emailCompletionFailure));

          if (result.value._tag === "Rejected") return yield* EmailRejected.make({});

          return {
            value: { continuation: result.value.continuation },
            credentialCommands: result.credentialCommands,
          };
        }),
        planComplete: Effect.fn("EmailAddresses.planComplete")(
          function* (action, invocation, input) {
            yield* noAmbient();
            const current = yield* bound(action, invocation, input);
            const proofs = action === "verify-address" ? verify : change;

            const completion = yield* proofs
              .planComplete({
                continuationId: input.continuationId,
                credential: input.credential,
                binding: current.binding,
              })
              .pipe(Effect.mapError(emailCompletionFailure));

            if (!(yield* persistence.checkCompletion(completion.input)))
              return yield* EmailRejected.make({});
            const authorization = yield* authorize(invocation, input, current.challenge);

            const invalidation =
              action === "verify-address" && current.captured.targetIdentifierRevision !== undefined
                ? undefined
                : sessionInvalidationWindow(
                    "identifier-change",
                    strategy.capabilities,
                    strategy.policy,
                  );

            const snapshot = lifecycleSnapshot({
              action: "identifier-change",
              operation: `${moduleId}/${action}`,
              method: "email-code",
              subjectId: current.captured.revision.subjectId,
              identifiers: [
                ...(action === "change-address" && current.captured.source
                  ? [current.captured.source.identifier]
                  : []),
                current.identifier,
              ],
            });

            yield* hooks.before(snapshot);

            const bytes = yield* crypto
              .randomBytes(32)
              .pipe(Effect.mapError(() => EmailUnavailable.make({})));

            const event = lifecycleEvent({
              id: LifecycleEventId.make(Base64Url.encode(bytes)),
              occurredAtMillis: DateTime.toEpochMillis(yield* DateTime.now),
              snapshot,
            });

            const mutation = Object.freeze({
              moduleId,
              commandId: input.commandId,
              target: current.identifier,
              captured: current.captured,
              authorization,
              completion,
              ...(invalidation === undefined ? {} : { invalidation }),
            });

            const prepare = (
              decision: "changed" | "rejected",
              journal: Parameters<
                Parameters<EmailAddressPersistence["Service"]["changeWithProof"]>[1]
              >[1],
            ) => {
              if (decision === "changed") journal.stage(event);

              return journal.prepare<Result>({
                value:
                  decision === "changed"
                    ? invalidation === undefined
                      ? {}
                      : { invalidation }
                    : { _tag: "Rejected" },
                credentialCommands:
                  decision === "changed"
                    ? [
                        ...(invalidation === undefined
                          ? []
                          : [{ _tag: "Clear" as const, slot: "session" as const }]),
                        { _tag: "Clear", slot: "pending-proof" },
                        { _tag: "Clear", slot: "proof-continuation" },
                        { _tag: "Clear", slot: "request-binding" },
                      ]
                    : [],
              });
            };

            const commit = Effect.gen(function* () {
              const owner = yield* EmailAddressPersistence;

              return yield* action === "verify-address"
                ? owner.verifyWithProof(mutation, prepare)
                : owner.changeWithProof(mutation, prepare);
            });

            return Object.freeze({ commit });
          },
        ),
        cleanup: Effect.fn("EmailAddresses.cleanup")(function* (limit) {
          yield* noAmbient();
          yield* Schema.decodeEffect(
            Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 1000 })),
          )(limit).pipe(Effect.mapError(() => EmailRejected.make({})));

          const receipt = yield* persistence.cleanup({ moduleId, limit }, (value, journal) =>
            journal.prepare(value),
          );

          return yield* receipt.read.pipe(Effect.mapError(() => EmailUnavailable.make({})));
        }),
      });
    }),
  );

  const makeOperations = <
    const Mode extends "verify" | "change",
    const Schemas extends {
      readonly request: typeof RequestInput | typeof ChangeRequest;
      readonly resend: typeof ResendInput | typeof ChangeResend;
      readonly attempt: typeof AttemptInput | typeof ChangeAttempt;
      readonly complete: typeof CompleteInput | typeof ChangeComplete;
    },
  >(
    mode: Mode,
    schemas: Schemas,
  ) => {
    const action = mode === "verify" ? "verify-address" : "change-address";

    const admitRequest = proofRequestAdmission(`${moduleId}/address/${mode}`).pipe(
      Effect.mapError(emailCompletionFailure),
    );

    const Request = makeOperation(`${moduleId}/address/${mode}/request`, {
      authorize: () => admitRequest,
      payload: schemas.request,
      success: ProofRequestReceipt,
      error: Failure,
      access: "authenticated",
      exposure: "public",
      replay: "idempotent",
    });

    const Resend = makeOperation(`${moduleId}/address/${mode}/resend`, {
      authorize: () => admitRequest,
      payload: schemas.resend,
      success: ProofRequestReceipt,
      error: Failure,
      access: "authenticated",
      exposure: "public",
      replay: "idempotent",
    });

    const Attempt = makeOperation(`${moduleId}/address/${mode}/attempt`, {
      payload: schemas.attempt,
      success: AttemptSuccess,
      error: Failure,
      access: "authenticated",
      exposure: "public",
      replay: "single-use",
      credentials: true,
    });

    const Complete = makeOperation(`${moduleId}/address/${mode}/complete`, {
      payload: schemas.complete,
      success: Success,
      error: Failure,
      access: "authenticated",
      exposure: "public",
      replay: "single-use",
      credentials: true,
    });

    const handlersLayer = Layer.mergeAll(
      Request.handlerLayer(
        Effect.fn("EmailAddresses.Request")(function* (input, invocation) {
          return yield* (yield* Addresses).request(action, invocation, input);
        }),
      ),
      Resend.handlerLayer(
        Effect.fn("EmailAddresses.Resend")(function* (input, invocation) {
          return yield* (yield* Addresses).request(action, invocation, input, input.supersedes);
        }),
      ),
      Attempt.credentialHandlerLayer(
        Effect.fn("EmailAddresses.Attempt")(function* (input, invocation) {
          return yield* (yield* Addresses).attempt(action, invocation, input);
        }),
      ),
      Complete.credentialHandlerLayer(
        Effect.fn("EmailAddresses.Complete")(function* (input, invocation) {
          const plan = yield* (yield* Addresses).planComplete(action, invocation, input);
          const receipt = yield* plan.commit;
          const result = yield* receipt.read.pipe(Effect.mapError(() => EmailUnavailable.make({})));

          if ("_tag" in result.value) return yield* EmailRejected.make({});

          return { value: result.value, credentialCommands: result.credentialCommands };
        }),
      ),
    );

    return Object.freeze({
      operations: { Request, Resend, Attempt, Complete },
      handlersLayer,
      group: operationGroup(Request, Resend, Attempt, Complete),
    });
  };

  const verify = makeOperations("verify", {
    request: RequestInput,
    resend: ResendInput,
    attempt: AttemptInput,
    complete: CompleteInput,
  });

  const change = makeOperations("change", {
    request: ChangeRequest,
    resend: ChangeResend,
    attempt: ChangeAttempt,
    complete: ChangeComplete,
  });

  const Cleanup = makeOperation(`${moduleId}/address/cleanup`, {
    payload: Schema.Struct({
      limit: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 1000 })),
    }),
    success: Schema.Struct({ removed: Schema.Natural, hasMore: Schema.Boolean }),
    error: Failure,
    access: "system",
    exposure: "internal",
    replay: "idempotent",
  });

  const cleanupLayer = Cleanup.handlerLayer(
    Effect.fn("EmailAddresses.Cleanup")(function* (input) {
      return yield* (yield* Addresses).cleanup(input.limit);
    }),
  );

  return Object.freeze({
    Addresses,
    layer,
    verify,
    change,
    Cleanup,
    cleanupLayer,
    verifyProof,
    changeProof,
  });
};
