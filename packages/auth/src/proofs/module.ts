import { Cause, Context, DateTime, Effect, Layer, Redacted, Schema, type Types } from "effect";

import { defaultLayer } from "../auth/defaults";
import { hasCommitScope, type PreparedCommit } from "../hooks/commit";
import { LifecycleHooks } from "../hooks/LifecycleHooks";
import {
  HookDenied,
  LifecycleEventId,
  type LifecycleAction,
  lifecycleEvent,
  lifecycleSnapshot,
} from "../hooks/models";
import { reportAuthFailure } from "../internal/diagnostics";
import type { AuthOperationResult } from "../operations/credentials";
import { makeOperation, operationGroup } from "../operations/operation";
import { Locale } from "../Schema";
import type { ProofCompletionPlan } from "./completion";
import {
  makeProofCrypto,
  proofKeysFor,
  type ProofSecretPolicy,
  validateProofBinding,
} from "./crypto";
import type { ProofDelivery } from "./delivery";
import {
  type PreparedProofDispatch,
  type ProofIssuePlan,
  makeProofDispatch,
  readProofCommit,
} from "./dispatch";
import { EmailProofDelivery, emailProofDeliveryLayer } from "./EmailProofDelivery";
import {
  ProofCapabilityUnsupported,
  ProofConfigurationError,
  ProofError,
  ProofInvalid,
  ProofUnavailable,
} from "./errors";
import {
  type ProofCompletionDecision,
  type ProofBinding,
  ProofCleanupResult,
  ProofContinuation,
  ProofContinuationId,
  ProofDeliveryId,
  ProofId,
  ProofPurpose,
  ProofReference,
  ProofRequestId,
  ProofRequestReceipt,
  ProofVersion,
} from "./models";
import { type ProofPolicy, validateProofPolicy } from "./policy";
import { ProofDispatchScheduler } from "./ProofDispatchScheduler";
import { ProofPersistence, type ProofRecord } from "./ProofPersistence";
import { SmsProofDelivery } from "./SmsProofDelivery";

export interface ProofModule<Id extends string, Binding> {
  readonly moduleId: Id;
  readonly _tag: "effect-auth/ProofModule";
  readonly binding: Types.Invariant<Binding>;
}

const Credential = Schema.RedactedFromValue(Schema.String.check(Schema.isMaxLength(4096)));

const noAmbient = Effect.fn("Proofs.noAmbient")(function* () {
  if (yield* hasCommitScope) return yield* ProofCapabilityUnsupported.make({});
});

/** Snapshot owned configuration data without evaluating application codecs or validating it. */
export const snapshotProofConfiguration = <
  Configuration extends {
    readonly secret: ProofSecretPolicy;
    readonly policy: ProofPolicy;
  },
>(
  input: Configuration,
) =>
  Object.freeze({
    ...input,
    secret: Object.freeze({ ...input.secret }),
    policy: Object.freeze({
      ...input.policy,
      abuse: Object.freeze({
        ...input.policy?.abuse,
        issues: Object.freeze({ ...input.policy?.abuse?.issues }),
        attempts: Object.freeze({ ...input.policy?.abuse?.attempts }),
        subjectIssues: Object.freeze({ ...input.policy?.abuse?.subjectIssues }),
        subjectAttempts: Object.freeze({ ...input.policy?.abuse?.subjectAttempts }),
        actionIssues: Object.freeze({ ...input.policy?.abuse?.actionIssues }),
        actionAttempts: Object.freeze({ ...input.policy?.abuse?.actionAttempts }),
      }),
    }),
  });

/** Each module has one fixed purpose and a schema that makes required binding fields mandatory.
 * Consumer codec extensions are not implicit authority: bind every extra relevant
 * field into contextDigest. Canonical proof bytes include only the declared core binding.
 */
export const makeProofModule = <
  const Id extends string,
  Binding extends Schema.Codec<ProofBinding, unknown, unknown, unknown>,
  const Secret extends ProofSecretPolicy = ProofSecretPolicy,
>(
  moduleId: Id,
  input: {
    readonly purpose: ProofPurpose;
    readonly binding: Binding;
    readonly channel: "email" | "sms";
    readonly template?: string;
    readonly url?: string;
    readonly secret: Secret;
    readonly policy: ProofPolicy;
  },
) => {
  const options = snapshotProofConfiguration({
    ...input,
    template: input.template ?? input.purpose,
  });

  const BindingCodec: Schema.Codec<
    Binding["Type"],
    Binding["Encoded"],
    Binding["DecodingServices"],
    Binding["EncodingServices"]
  > = options.binding;

  type BindingValue = Binding["Type"];

  const RequestInput = Schema.Struct({
    requestId: ProofRequestId,
    binding: BindingCodec,
    locale: Locale,
    eligible: Schema.Boolean,
  });

  const ResendInput = Schema.Struct({ ...RequestInput.fields, supersedes: ProofId });

  const AttemptInput = Schema.Struct({
    reference: ProofReference,
    binding: BindingCodec,
    credential: Credential,
  });

  const CompleteInput = Schema.Struct({
    continuationId: ProofContinuationId,
    binding: BindingCodec,
    credential: Credential,
  });

  const Accepted = Schema.TaggedStruct("Accepted", { continuation: ProofContinuation });

  type Accepted = typeof Accepted.Type;
  type IssueInput = typeof RequestInput.Type & { readonly supersedes?: ProofId };
  type PrivateAttempt =
    | AuthOperationResult<Accepted>
    | { readonly value: { readonly _tag: "Rejected" }; readonly credentialCommands: readonly [] };
  type Failure = ProofError | HookDenied;
  type Service = {
    readonly planIssue: (input: IssueInput) => Effect.Effect<ProofIssuePlan, Failure>;
    readonly prepareIssue: (
      input: IssueInput,
    ) => Effect.Effect<PreparedCommit<PreparedProofDispatch>, Failure>;
    readonly prepareAttempt: (
      input: typeof AttemptInput.Type,
    ) => Effect.Effect<PreparedCommit<PrivateAttempt>, Failure>;
    readonly planComplete: (
      input: typeof CompleteInput.Type,
    ) => Effect.Effect<ProofCompletionPlan, Failure>;
    readonly prepareComplete: (
      input: typeof CompleteInput.Type,
    ) => Effect.Effect<PreparedCommit<ProofCompletionDecision>, Failure>;
    readonly cancel: (binding: BindingValue) => Effect.Effect<PreparedCommit<void>, Failure>;
    readonly cleanup: (limit: number) => Effect.Effect<PreparedCommit<ProofCleanupResult>, Failure>;
  };

  const Proofs = Context.Service<ProofModule<Id, BindingValue>, Service>(
    `effect-auth/proofs/${moduleId}`,
  );

  const makeLayer = <DeliveryId>(
    deliveryKey: Context.Key<DeliveryId, ProofDelivery>,
    channel: "email" | "sms",
  ) =>
    Layer.effect(
      Proofs,
      Effect.gen(function* () {
        yield* Schema.decodeEffect(ProofPurpose)(options.purpose).pipe(
          Effect.mapError(() => ProofConfigurationError.make({ reason: "binding" })),
        );
        if (
          channel !== options.channel ||
          !Schema.is(Schema.NonEmptyString.check(Schema.isMaxLength(256)))(moduleId) ||
          !Schema.is(Schema.NonEmptyString.check(Schema.isMaxLength(128)))(options.template)
        )
          return yield* ProofConfigurationError.make({ reason: "delivery" });
        const policy = yield* validateProofPolicy(options.policy);
        const delivery = yield* deliveryKey;

        if (
          policy.maximumDeliveryAttempts > 1 &&
          delivery.vendor.idempotencyMillis < policy.lifetimeMillis
        )
          return yield* ProofConfigurationError.make({ reason: "delivery" });

        const crypto = yield* makeProofCrypto(
          moduleId,
          options.purpose,
          options.secret,
          yield* proofKeysFor(options.secret),
        );

        const store = yield* ProofPersistence;
        const scheduler = yield* ProofDispatchScheduler;

        // Bind only owned services; dispatch still observes its execution-time commit scope.
        const dispatchServices = Context.make(ProofPersistence, store).pipe(
          Context.add(deliveryKey, delivery),
        );

        const hooks = yield* LifecycleHooks;

        const services = yield* Effect.context<
          Binding["DecodingServices"] | Binding["EncodingServices"]
        >();

        const bindingCodec = Schema.toCodecIso(BindingCodec);

        const projectBinding = (value: BindingValue) =>
          Schema.encodeEffect(bindingCodec)(value).pipe(
            Effect.flatMap(Schema.decodeEffect(bindingCodec)),
            Effect.provide(services),
            Effect.flatMap(validateProofBinding),
            Effect.mapError(() => ProofInvalid.make({})),
          );

        const eventFor = Effect.fn("Proofs.eventFor")(function* (
          action: LifecycleAction,
          binding: ProofBinding,
        ) {
          const snapshot = lifecycleSnapshot({
            action,
            operation: `${moduleId}/${action}`,
            identifiers: [binding.identifier],
            ...(binding._tag === "Identifier" ? {} : { subjectId: binding.revision.subjectId }),
          });

          yield* hooks.before(snapshot);

          return lifecycleEvent({
            id: LifecycleEventId.make(Redacted.value(yield* crypto.generateOpaque())),
            occurredAtMillis: DateTime.toEpochMillis(yield* DateTime.now),
            snapshot,
          });
        });

        const planIssue = Effect.fn("Proofs.planIssue")(function* (request: IssueInput) {
          const binding = yield* projectBinding(request.binding);

          const eligible = yield* Schema.decodeEffect(Schema.Boolean)(request.eligible).pipe(
            Effect.mapError(() => ProofInvalid.make({})),
          );

          const supersedes = request.supersedes;

          const locale = yield* Schema.decodeEffect(Locale)(request.locale).pipe(
            Effect.mapError(() => ProofInvalid.make({})),
          );

          const requestId = yield* Schema.decodeEffect(ProofRequestId)(request.requestId).pipe(
            Effect.mapError(() => ProofInvalid.make({})),
          );

          const fingerprint = yield* crypto.fingerprint(
            binding,
            {
              channel: options.channel,
              vendor: delivery.vendor.vendorId,
              template: options.template,
              locale,
            },
            supersedes,
          );

          const proofId = ProofId.make(Redacted.value(yield* crypto.generateOpaque()));
          const reference = { proofId, purpose: options.purpose, keyId: crypto.activeKeyId };
          const before = yield* eventFor("proof-request", binding).pipe(Effect.result);

          if (
            before._tag === "Failure" &&
            (before.failure._tag !== "HookDenied" || before.failure.reason === "unavailable")
          )
            return yield* ProofUnavailable.make({});
          const secret = yield* crypto.generate();
          const verifier = yield* crypto.digest(proofId, binding, secret, crypto.activeKeyId);

          if (verifier === undefined) return yield* ProofUnavailable.make({});
          const issuedAtMillis = DateTime.toEpochMillis(yield* DateTime.now);

          const record: ProofRecord = {
            moduleId,
            purpose: options.purpose,
            proofId,
            requestId,
            fingerprint,
            deliveryId: ProofDeliveryId.make(proofId),
            binding,
            verifier,
            issuedAtMillis,
            expiresAtMillis: issuedAtMillis + policy.lifetimeMillis,
            version: ProofVersion.make(Redacted.value(yield* crypto.generateOpaque())),
          };

          const message = {
            deliveryId: record.deliveryId,
            purpose: options.purpose,
            reference,
            recipient: binding.identifier,
            secret,
            format: crypto.format,
            expiresAtMillis: record.expiresAtMillis,
            template: options.template,
            locale,
          };

          return {
            commit: store.issue(
              {
                record,
                policy,
                eligible: eligible && before._tag === "Success",
                ...(supersedes === undefined ? {} : { supersedes }),
              },
              (decision, journal) => {
                if (
                  decision._tag === "Issued" &&
                  (decision.record.proofId !== record.proofId ||
                    decision.record.verifier.digest !== record.verifier.digest ||
                    decision.record.verifier.keyId !== record.verifier.keyId ||
                    decision.record.version !== record.version ||
                    decision.record.fingerprint !== record.fingerprint)
                )
                  throw ProofUnavailable.make({});
                if (decision._tag === "Issued") {
                  if (before._tag !== "Success") throw ProofUnavailable.make({});
                  journal.stage(before.success);
                }

                const prepared =
                  decision._tag === "Issued"
                    ? makeProofDispatch(deliveryKey, record, message, policy)
                    : { receipt: decision.receipt, dispatch: Effect.void };

                const work = prepared.dispatch.pipe(
                  Effect.provide(dispatchServices),
                  Effect.asVoid,
                  Effect.catchCause((cause) =>
                    reportAuthFailure("proof-delivery", cause).pipe(
                      Effect.andThen(Cause.hasInterrupts(cause) ? Effect.interrupt : Effect.void),
                    ),
                  ),
                  Effect.withTracerEnabled(false),
                );

                return journal.prepare(
                  Object.freeze({
                    receipt: prepared.receipt,
                    // Admission is identical for issued, suppressed and replayed receipts.
                    schedule: noAmbient().pipe(Effect.andThen(() => scheduler.schedule(work))),
                  }),
                );
              },
            ),
          };
        });

        const planComplete = Effect.fn("Proofs.planComplete")(function* (
          request: typeof CompleteInput.Type,
        ): Effect.fn.Return<ProofCompletionPlan, Failure> {
          const binding = yield* projectBinding(request.binding);
          const event = yield* eventFor("proof-completion", binding);

          const digest = yield* crypto.continuationDigest(
            request.continuationId,
            binding,
            request.credential,
          );

          if (digest === undefined) return yield* ProofInvalid.make({});

          return Object.freeze({
            input: Object.freeze({
              moduleId,
              purpose: options.purpose,
              continuationId: request.continuationId,
              continuationDigest: digest,
              binding,
              nowMillis: DateTime.toEpochMillis(yield* DateTime.now),
            }),
            prepare: <A>(
              decision: ProofCompletionDecision,
              journal: import("../hooks/commit").CommitJournal,
              project: (decision: ProofCompletionDecision) => A,
            ) => {
              const value = project(decision);

              if (decision === "completed") journal.stage(event);

              return journal.prepare(value);
            },
          });
        });

        return Proofs.of({
          planIssue,
          prepareIssue: (request) => planIssue(request).pipe(Effect.flatMap((plan) => plan.commit)),
          prepareAttempt: Effect.fn("Proofs.prepareAttempt")(function* (request) {
            const binding = yield* projectBinding(request.binding);
            const event = yield* eventFor("proof-verification", binding);

            const candidate =
              request.reference.purpose === options.purpose
                ? yield* crypto.digest(
                    request.reference.proofId,
                    binding,
                    request.credential,
                    request.reference.keyId,
                  )
                : undefined;

            const credential = yield* crypto.generateOpaque();

            const continuationId = ProofContinuationId.make(
              Redacted.value(yield* crypto.generateOpaque()),
            );

            const continuationDigest = yield* crypto.continuationDigest(
              continuationId,
              binding,
              credential,
            );

            if (continuationDigest === undefined) return yield* ProofUnavailable.make({});

            return yield* store.attempt<PrivateAttempt>(
              {
                moduleId,
                purpose: options.purpose,
                proofId: request.reference.proofId,
                binding,
                ...(candidate === undefined ? {} : { candidate }),
                continuationId,
                continuationDigest,
                nowMillis: DateTime.toEpochMillis(yield* DateTime.now),
                policy,
              },
              (decision, journal) => {
                if (decision._tag === "Rejected")
                  return journal.prepare({ value: decision, credentialCommands: [] });
                if (
                  decision.continuation.continuationId !== continuationId ||
                  decision.continuation.purpose !== options.purpose
                )
                  throw ProofUnavailable.make({});
                journal.stage(event);

                return journal.prepare({
                  value: decision,
                  credentialCommands: [
                    {
                      _tag: "Issue" as const,
                      slot: "proof-continuation" as const,
                      credential,
                      expiresAtMillis: decision.continuation.expiresAtMillis,
                    },
                  ],
                });
              },
            );
          }),
          planComplete,
          prepareComplete: (request) =>
            planComplete(request).pipe(
              Effect.flatMap((plan) =>
                store.complete(plan.input, (decision, journal) =>
                  plan.prepare(decision, journal, (value) => value),
                ),
              ),
            ),
          cancel: Effect.fn("Proofs.cancel")(function* (input) {
            const binding = yield* projectBinding(input);

            return yield* store.cancel(
              {
                moduleId,
                purpose: options.purpose,
                binding,
                nowMillis: DateTime.toEpochMillis(yield* DateTime.now),
              },
              (_, journal) => journal.prepare(undefined),
            );
          }),
          cleanup: Effect.fn("Proofs.cleanup")(function* (limit) {
            yield* Schema.decodeEffect(
              Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 1000 })),
            )(limit).pipe(Effect.mapError(() => ProofInvalid.make({})));

            return yield* store.cleanup(
              { moduleId, nowMillis: DateTime.toEpochMillis(yield* DateTime.now), limit },
              (decision, journal) => journal.prepare(decision),
            );
          }),
        });
      }),
    ).pipe(Layer.provide(defaultLayer(ProofDispatchScheduler, ProofDispatchScheduler.layer)));

  const emailLayer = makeLayer(EmailProofDelivery, "email").pipe(
    Layer.provide(emailProofDeliveryLayer(options)),
  );

  const smsLayer = makeLayer(SmsProofDelivery, "sms");
  const errors = Schema.Union([ProofError, HookDenied]);

  const Request = makeOperation(`${moduleId}/request`, {
    payload: RequestInput,
    success: ProofRequestReceipt,
    error: errors,
    access: "system",
    replay: "idempotent",
  });

  const Resend = makeOperation(`${moduleId}/resend`, {
    payload: ResendInput,
    success: ProofRequestReceipt,
    error: errors,
    access: "system",
    replay: "idempotent",
  });

  const Attempt = makeOperation(`${moduleId}/attempt`, {
    payload: AttemptInput,
    success: Accepted,
    error: errors,
    access: "system",
    replay: "single-use",
    credentials: true,
  });

  const Complete = makeOperation(`${moduleId}/complete`, {
    payload: CompleteInput,
    success: Schema.Void,
    error: errors,
    access: "system",
    replay: "single-use",
    credentials: true,
  });

  const Cancel = makeOperation(`${moduleId}/cancel`, {
    payload: Schema.Struct({ binding: BindingCodec }),
    success: Schema.Void,
    error: errors,
    access: "system",
    replay: "idempotent",
  });

  const Cleanup = makeOperation(`${moduleId}/cleanup`, {
    payload: Schema.Struct({
      limit: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 1000 })),
    }),
    success: ProofCleanupResult,
    error: errors,
    access: "system",
    replay: "idempotent",
  });

  const requestHandler = Effect.fn("ProofOperation.request")(function* (input: IssueInput) {
    yield* noAmbient();
    const dispatch = yield* readProofCommit(yield* (yield* Proofs).prepareIssue(input));

    yield* dispatch.schedule;

    return dispatch.receipt;
  });

  const handlersLayer = Layer.mergeAll(
    Request.handlerLayer(requestHandler),
    Resend.handlerLayer(requestHandler),
    Attempt.credentialHandlerLayer(
      Effect.fn("ProofOperation.attempt")(function* (input) {
        yield* noAmbient();
        const result = yield* readProofCommit(yield* (yield* Proofs).prepareAttempt(input));

        if (result.value._tag === "Rejected") return yield* ProofInvalid.make({});

        return { value: result.value, credentialCommands: result.credentialCommands };
      }),
    ),
    Complete.credentialHandlerLayer(
      Effect.fn("ProofOperation.complete")(function* (input) {
        yield* noAmbient();
        const result = yield* readProofCommit(yield* (yield* Proofs).prepareComplete(input));

        if (result === "rejected") return yield* ProofInvalid.make({});

        return {
          value: undefined,
          credentialCommands: [{ _tag: "Clear" as const, slot: "proof-continuation" as const }],
        };
      }),
    ),
    Cancel.handlerLayer(
      Effect.fn("ProofOperation.cancel")(function* (input) {
        yield* noAmbient();

        return yield* readProofCommit(yield* (yield* Proofs).cancel(input.binding));
      }),
    ),
    Cleanup.handlerLayer(
      Effect.fn("ProofOperation.cleanup")(function* (input) {
        yield* noAmbient();

        return yield* readProofCommit(yield* (yield* Proofs).cleanup(input.limit));
      }),
    ),
  );

  const operations = { Request, Resend, Attempt, Complete, Cancel, Cleanup };

  return Object.freeze({
    Proofs,
    emailLayer,
    smsLayer,
    handlersLayer,
    operations,
    group: operationGroup(...Object.values(operations)),
  });
};
