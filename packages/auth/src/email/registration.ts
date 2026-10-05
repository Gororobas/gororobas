import { Context, Crypto, DateTime, Effect, Layer, Schema, type Types } from "effect";
import { Base64Url } from "effect/encoding";

import { hasCommitScope, type PreparedCommit } from "../hooks/commit";
import { LifecycleHooks } from "../hooks/LifecycleHooks";
import { HookDenied, LifecycleEventId, lifecycleEvent, lifecycleSnapshot } from "../hooks/models";
import { LoginIdentifier } from "../identity/models";
import type { AuthOperationResult } from "../operations/credentials";
import { makeOperation, operationGroup } from "../operations/operation";
import type { makeRequestBinding } from "../operations/requestBinding";
import { RequestBindingCredential, RequestBindingFlowId } from "../operations/requestBinding";
import { proofRequestAdmission } from "../proofs/admission";
import type { ProofCompletionPlan } from "../proofs/completion";
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
import type { PrepareEmailCommit } from "./EmailAddressPersistence";
import {
  emailCompletionFailure,
  EmailMethodUnsupported,
  EmailRejected,
  EmailUnavailable,
} from "./errors";
import { EmailCommandId, type EmailRegistrationDecision } from "./models";

const Failure = Schema.Union([EmailRejected, EmailUnavailable, EmailMethodUnsupported, HookDenied]);

type Failure = typeof Failure.Type;

const Success = Schema.Union([
  Schema.TaggedStruct("RegistrationAccepted", {}),
  Schema.TaggedStruct("ProvisioningPending", {
    reference: Schema.NonEmptyString.check(Schema.isMaxLength(256)),
  }),
]);

const AttemptSuccess = Schema.Struct({ continuation: ProofContinuation });

const noAmbient = Effect.fn("EmailRegistration.noAmbient")(function* () {
  if (yield* hasCommitScope) return yield* EmailMethodUnsupported.make({});
});

const tuple = Schema.fromJsonString(Schema.Array(Schema.String));

export interface RegistrationModule<Id extends string, Kind extends string, Registration> {
  readonly moduleId: Id;
  readonly kind: Kind;
  readonly registration: Types.Invariant<Registration>;
}

export const makeEmailRegistration = <
  const Id extends string,
  const ProofModuleId extends string,
  Registration extends Schema.Codec<unknown, unknown, unknown, unknown>,
>(
  moduleId: Id,
  registration: Registration,
  proof: ReturnType<typeof makeProofModule<ProofModuleId, typeof ProofBinding>>,
  binder: ReturnType<typeof makeRequestBinding<Id, "email-entry">>,
) => {
  const RegistrationCodec: Schema.Codec<
    Registration["Type"],
    Registration["Encoded"],
    Registration["DecodingServices"],
    Registration["EncodingServices"]
  > = registration;

  const base = {
    flowId: RequestBindingFlowId,
    requestBinding: RequestBindingCredential,
    email: Schema.String.check(Schema.isMaxLength(320)).pipe(Schema.decodeTo(Email)),
    registration: RegistrationCodec,
  };

  const BindingInput = Schema.Struct(base);

  const RequestInput = Schema.Struct({
    ...base,
    requestId: ProofRequestId,
    locale: Locale,
  });

  const ResendInput = Schema.Struct({ ...RequestInput.fields, supersedes: ProofId });

  const AttemptInput = Schema.Struct({
    ...base,
    reference: ProofReference,
    secret: Schema.RedactedFromValue(Schema.String.check(Schema.isMaxLength(4096))),
  });

  const CompleteInput = Schema.Struct({
    ...base,
    commandId: EmailCommandId,
    continuationId: ProofContinuationId,
    credential: Schema.RedactedFromValue(Schema.String.check(Schema.isMaxLength(4096))),
  });

  const RegistrationAuthority = Context.Service<
    RegistrationModule<Id, "authority", Registration["Type"]>,
    {
      /** Deterministic versioned digest of the entire validated application intent.
       * Snapshot data retained for the owner must not be mutated by this callback.
       * No raw JSON fingerprinting or consumer codec transformation replay is assumed.
       */
      readonly inspect: (input: {
        readonly identifier: LoginIdentifier;
        readonly registration: Registration["Type"];
      }) => Effect.Effect<
        { readonly fingerprint: TokenDigest; readonly eligible: boolean },
        EmailUnavailable
      >;
      /** One physical owner consumes completion and creates subject + verified identifier
       * + active email credential, or a protected pending reconciliation intent. No orphan
       * subject/upsert/session issuance. Exact command/intent uniqueness prevents adopting
       * a prior subject or replacing pending intent; pending reference is nonauthorizing.
       */
      readonly registerWithProof: <A>(
        input: {
          readonly moduleId: string;
          readonly commandId: EmailCommandId;
          readonly identifier: LoginIdentifier;
          readonly registration: Registration["Type"];
          readonly fingerprint: TokenDigest;
          readonly completion: ProofCompletionPlan;
        },
        prepare: PrepareEmailCommit<EmailRegistrationDecision, A>,
      ) => Effect.Effect<PreparedCommit<A>, EmailUnavailable>;
    }
  >(`effect-auth/email/${moduleId}/RegistrationAuthority`);

  type Result = AuthOperationResult<typeof Success.Type | { readonly _tag: "Rejected" }>;
  type Plan = {
    readonly commit: Effect.Effect<
      PreparedCommit<Result>,
      EmailUnavailable,
      typeof RegistrationAuthority.Identifier
    >;
  };

  const Registrations = Context.Service<
    RegistrationModule<Id, "registration", Registration["Type"]>,
    {
      readonly request: (
        input: typeof RequestInput.Type,
        supersedes?: ProofId,
      ) => Effect.Effect<ProofRequestReceipt, Failure>;
      readonly attempt: (
        input: typeof AttemptInput.Type,
      ) => Effect.Effect<AuthOperationResult<typeof AttemptSuccess.Type>, Failure>;
      readonly planComplete: (input: typeof CompleteInput.Type) => Effect.Effect<Plan, Failure>;
    }
  >(`effect-auth/email/${moduleId}/Registrations`);

  const layer = Layer.effect(
    Registrations,
    Effect.gen(function* () {
      const bindings = yield* binder.RequestBinding;
      const proofs = yield* proof.Proofs;
      const authority = yield* RegistrationAuthority;
      const hooks = yield* LifecycleHooks;
      const crypto = yield* Crypto.Crypto;

      const services = yield* Effect.context<
        Registration["DecodingServices"] | Registration["EncodingServices"]
      >();

      // Derive from Type so wire transformations are not replayed. JSON projection
      // detaches mutable built-ins (including DateTime); opaque declared Type values
      // without a derived JSON representation fail safely rather than share graphs.
      const dataCodec = Schema.toCodecJson(Schema.toType(RegistrationCodec));

      const snapshotData = (data: Registration["Type"]) =>
        Schema.encodeEffect(dataCodec)(data).pipe(
          Effect.flatMap(Schema.decodeEffect(dataCodec)),
          Effect.provide(services),
          Effect.mapError(() => EmailRejected.make({})),
        );

      const bound = Effect.fn("EmailRegistration.binding")(function* (
        input: typeof BindingInput.Type,
      ) {
        const verified = yield* bindings
          .verify(input.flowId, input.requestBinding)
          .pipe(
            Effect.mapError((error) =>
              error._tag === "RequestBindingInvalid"
                ? EmailRejected.make({})
                : EmailUnavailable.make({}),
            ),
          );

        const identifier = Object.freeze(
          LoginIdentifier.make({ namespace: "email", value: input.email }),
        );

        const data = yield* snapshotData(input.registration);

        const inspected = yield* authority.inspect({
          identifier,
          registration: yield* snapshotData(data),
        });

        const fingerprint = yield* Schema.decodeEffect(TokenDigest.check(Schema.isMaxLength(256)))(
          inspected.fingerprint,
        ).pipe(Effect.mapError(() => EmailUnavailable.make({})));

        const encoded = yield* Schema.encodeEffect(tuple)([
          "effect-auth/email-registration/v1",
          moduleId,
          input.flowId,
          verified.verifier,
          identifier.value,
          fingerprint,
        ]).pipe(Effect.mapError(() => EmailUnavailable.make({})));

        const digest = yield* crypto
          .digest("SHA-256", new TextEncoder().encode(encoded))
          .pipe(Effect.mapError(() => EmailUnavailable.make({})));

        const binding: ProofBinding = {
          _tag: "Identifier",
          identifier,
          flowId: input.flowId,
          contextDigest: TokenDigest.make(Base64Url.encode(digest)),
        };

        return { data, identifier, fingerprint, eligible: inspected.eligible, binding };
      });

      return Registrations.of({
        request: Effect.fn("EmailRegistration.request")(function* (input, supersedes) {
          yield* noAmbient();
          const current = yield* bound(input);

          const dispatch = yield* proofs
            .prepareIssue({
              requestId: input.requestId,
              binding: current.binding,
              locale: input.locale,
              eligible: current.eligible,
              ...(supersedes === undefined ? {} : { supersedes }),
            })
            .pipe(
              Effect.flatMap(readProofCommit),
              Effect.mapError(() => EmailUnavailable.make({})),
            );

          yield* dispatch.schedule.pipe(Effect.mapError(() => EmailUnavailable.make({})));

          return dispatch.receipt;
        }),
        attempt: Effect.fn("EmailRegistration.attempt")(function* (input) {
          yield* noAmbient();
          const current = yield* bound(input);

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
        planComplete: Effect.fn("EmailRegistration.planComplete")(function* (input) {
          yield* noAmbient();
          const current = yield* bound(input);

          const completion = yield* proofs
            .planComplete({
              continuationId: input.continuationId,
              credential: input.credential,
              binding: current.binding,
            })
            .pipe(Effect.mapError(emailCompletionFailure));

          const snapshot = lifecycleSnapshot({
            action: "registration",
            operation: `${moduleId}/email-registration`,
            method: "email-code",
            identifiers: [current.identifier],
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

          const commandId = input.commandId;

          const commit = Effect.gen(function* () {
            const owner = yield* RegistrationAuthority;

            return yield* owner.registerWithProof(
              {
                moduleId,
                commandId,
                identifier: current.identifier,
                registration: current.data,
                fingerprint: current.fingerprint,
                completion,
              },
              (decision, journal) => {
                if (decision._tag === "Registered") journal.stage(event);

                return journal.prepare<Result>({
                  value:
                    decision._tag === "Registered" ? { _tag: "RegistrationAccepted" } : decision,
                  credentialCommands:
                    decision._tag === "Rejected"
                      ? []
                      : [
                          { _tag: "Clear", slot: "proof-continuation" },
                          { _tag: "Clear", slot: "request-binding" },
                        ],
                });
              },
            );
          });

          return Object.freeze({ commit });
        }),
      });
    }),
  );

  const admitRequest = proofRequestAdmission(`${moduleId}/registration`).pipe(
    Effect.mapError(emailCompletionFailure),
  );

  const Request = makeOperation(`${moduleId}/registration/request`, {
    authorize: () => admitRequest,
    payload: RequestInput,
    success: ProofRequestReceipt,
    error: Failure,
    access: "any",
    exposure: "public",
    replay: "idempotent",
  });

  const Resend = makeOperation(`${moduleId}/registration/resend`, {
    authorize: () => admitRequest,
    payload: ResendInput,
    success: ProofRequestReceipt,
    error: Failure,
    access: "any",
    exposure: "public",
    replay: "idempotent",
  });

  const Attempt = makeOperation(`${moduleId}/registration/attempt`, {
    payload: AttemptInput,
    success: AttemptSuccess,
    error: Failure,
    access: "any",
    exposure: "public",
    replay: "single-use",
    credentials: true,
  });

  const Complete = makeOperation(`${moduleId}/registration/complete`, {
    payload: CompleteInput,
    success: Success,
    error: Failure,
    access: "any",
    exposure: "public",
    replay: "single-use",
    credentials: true,
  });

  const handlersLayer = Layer.mergeAll(
    Request.handlerLayer(
      Effect.fn("EmailRegistration.Request")(function* (input) {
        return yield* (yield* Registrations).request(input);
      }),
    ),
    Resend.handlerLayer(
      Effect.fn("EmailRegistration.Resend")(function* (input) {
        return yield* (yield* Registrations).request(input, input.supersedes);
      }),
    ),
    Attempt.credentialHandlerLayer(
      Effect.fn("EmailRegistration.Attempt")(function* (input) {
        return yield* (yield* Registrations).attempt(input);
      }),
    ),
    Complete.credentialHandlerLayer(
      Effect.fn("EmailRegistration.Complete")(function* (input) {
        const plan = yield* (yield* Registrations).planComplete(input);
        const receipt = yield* plan.commit;
        const result = yield* receipt.read.pipe(Effect.mapError(() => EmailUnavailable.make({})));

        if (result.value._tag === "Rejected") return yield* EmailRejected.make({});

        return { value: result.value, credentialCommands: result.credentialCommands };
      }),
    ),
  );

  return Object.freeze({
    RegistrationAuthority,
    Registrations,
    layer,
    proof,
    handlersLayer,
    operations: { Request, Resend, Attempt, Complete },
    group: operationGroup(Request, Resend, Attempt, Complete),
  });
};
