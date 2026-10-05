import { Context, Crypto, Effect, Layer, Option, Redacted, Schema, type Types } from "effect";

import { makeAuthStrategy } from "../../auth/AuthStrategy";
import { cryptoLayer, defaultLayer, hooksLayer } from "../../auth/defaults";
import { hasCommitScope, type PreparedCommit } from "../../hooks/commit";
import { LifecycleHooks } from "../../hooks/LifecycleHooks";
import { HookDenied, lifecycleEvent, lifecycleSnapshot } from "../../hooks/models";
import { LoginIdentifier } from "../../identity/models";
import { type AuthInvocation } from "../../operations/context";
import type { AuthOperationResult } from "../../operations/credentials";
import { makeOperation, operationGroup } from "../../operations/operation";
import { proofRequestAdmission } from "../../proofs/admission";
import type { ProofSecretPolicy } from "../../proofs/crypto";
import { readProofCommit } from "../../proofs/dispatch";
import { defaultIngressLayer } from "../../proofs/HostIngressLimiter";
import {
  ProofBinding,
  ProofContinuation,
  ProofContinuationId,
  ProofPurpose,
  ProofReference,
  ProofRequestId,
  ProofRequestReceipt,
} from "../../proofs/models";
import { makeProofModule } from "../../proofs/module";
import type { ProofPolicy } from "../../proofs/policy";
import type { SubjectId } from "../../Schema";
import { Email, Locale } from "../../Schema";
import { assessAuthentication, snapshotAuthenticationEvidence } from "../../sessions/assurance";
import { AuthenticationAuthority } from "../../sessions/AuthenticationAuthority";
import { SessionInvalidationWindow, sessionInvalidationWindow } from "../../sessions/invalidation";
import type { AuthenticationEvidence } from "../../sessions/models";
import { AuthenticationFlowId } from "../../sessions/models";
import type { makeSessionModule } from "../../sessions/module";
import { newPasswordLayer } from "../defaults";
import { NewPasswordRejected, PasswordCheckUnavailable } from "../errors";
import { NewPasswordCheck } from "../NewPasswordCheck";
import { PasswordHashing } from "../PasswordHashing";
import { PasswordSignInInput } from "./contracts";
import {
  PasswordActionRequired,
  PasswordMethodConfigurationError,
  PasswordMethodUnsupported,
  PasswordRejected,
  PasswordUnavailable,
} from "./errors";
import {
  PasswordActionChallenge,
  PasswordCommandId,
  type PasswordAction,
  type PasswordActionAuthorization,
  type PasswordCredentialSnapshot,
  type PasswordReplacement,
} from "./models";
import { PasswordActionEvidence } from "./PasswordActionEvidence";
import {
  PasswordPersistence,
  type PreparePasswordCommit,
  type PasswordMutationInput,
} from "./PasswordPersistence";
import {
  type PasswordMethodPolicy,
  snapshotPasswordMethodPolicy,
  validatePasswordMethodPolicy,
} from "./policy";
import { makePasswordPreparation } from "./preparation";
import { makePasswordPrepared } from "./prepared";
import type { PasswordPreparedConfiguration } from "./preparedModels";
import { makePasswordSignIn, type PasswordSignInOptions } from "./signIn";
import {
  snapshotPasswordCredential,
  snapshotPasswordRequirement,
  snapshotPasswordRevision,
} from "./snapshot";
import { passwordCompletionFailure } from "./verification";

export interface MethodService<Id extends string, Kind extends string> {
  readonly moduleId: Id;
  readonly kind: Kind;
}

const BoundedEmail = Schema.String.check(Schema.isMaxLength(320)).pipe(Schema.decodeTo(Email));
const Password = Schema.RedactedFromValue(Schema.String.check(Schema.isMaxLength(65536)));
const OpaqueProof = Schema.RedactedFromValue(Schema.String.check(Schema.isMaxLength(4096)));
const FlowId = AuthenticationFlowId.check(Schema.isMaxLength(256));

const RegisterResult = Schema.Union([
  Schema.TaggedStruct("RegistrationAccepted", {}),
  Schema.TaggedStruct("ProvisioningPending", {
    reference: Schema.NonEmptyString.check(Schema.isMaxLength(256)),
  }),
]);

export type PasswordRegistrationDecision =
  | { readonly _tag: "Created"; readonly subjectId: SubjectId }
  | { readonly _tag: "Suppressed" }
  | { readonly _tag: "Pending"; readonly reference: string };

const MutationResult = Schema.Struct({ invalidation: SessionInvalidationWindow });
const Status = Schema.Struct({ hasPassword: Schema.Boolean });
const Cleanup = Schema.Struct({ removed: Schema.Natural, hasMore: Schema.Boolean });

const noAmbient = Effect.fn("Passwords.noAmbient")(function* () {
  if (yield* hasCommitScope) return yield* PasswordMethodUnsupported.make({});
});

const read = <A>(receipt: PreparedCommit<A>) =>
  receipt.read.pipe(Effect.mapError(() => PasswordUnavailable.make({})));

/** Public email/password method. Trusted claims/provisioning/action capabilities
 * are explicit; no product account model, implicit login or MFA bypass is supplied.
 */
const makePasswordWithManagement = <
  const Id extends string,
  const SessionModuleId extends string,
  Claims extends Schema.Codec<unknown, unknown, unknown, unknown>,
  Registration extends Schema.Codec<unknown, unknown, unknown, unknown>,
  const Secret extends ProofSecretPolicy = ProofSecretPolicy,
>(
  moduleId: Id,
  input: {
    readonly sessions: ReturnType<typeof makeSessionModule<SessionModuleId, Claims>>;
    readonly registration: Registration;
    readonly policy: PasswordMethodPolicy;
    readonly reset: {
      readonly secret: Secret;
      readonly url?: string;
      readonly policy: ProofPolicy;
    };
  },
) => {
  const sessions = input.sessions;

  const RegistrationCodec: Schema.Codec<
    Registration["Type"],
    Registration["Encoded"],
    Registration["DecodingServices"],
    Registration["EncodingServices"]
  > = input.registration;

  const policyInput = snapshotPasswordMethodPolicy(input.policy);

  const reset = makeProofModule(`${moduleId}/reset`, {
    ...input.reset,
    purpose: ProofPurpose.make("password-reset"),
    binding: ProofBinding,
    channel: "email",
  });

  type Completion = typeof sessions.CompletionResult.Type;

  const RegistrationAuthority = Context.Service<
    MethodService<Id, "registration"> & {
      readonly registration: Types.Invariant<Registration["Type"]>;
    },
    {
      /** Join application provisioning + unverified identifier + create-if-absent
       * password under one owner, or persist a protected recovery intent and Pending.
       * Request binding includes exact private credential intent; public requestId
       * alone cannot adopt another request's subject. Never upsert an existing login.
       * Every retry has a fresh salt: verifier equality cannot prove password equality.
       * Retain the original protected intent; replays never replace it or expose its
       * subject. Return uniform Accepted/Pending metadata or suppress the replay.
       * A pending reference is non-authorizing and cannot resume/adopt that intent.
       */
      readonly register: <A>(
        input: {
          readonly moduleId: string;
          readonly requestId: string;
          readonly identifier: LoginIdentifier;
          readonly registration: Registration["Type"];
          readonly replacement: PasswordReplacement;
        },
        prepare: PreparePasswordCommit<PasswordRegistrationDecision, A>,
      ) => Effect.Effect<PreparedCommit<A>, PasswordUnavailable>;
    }
  >(`effect-auth/password/${moduleId}/RegistrationAuthority`);

  /** Supply application session claims for the verified password's subject. */
  const SessionClaims = Context.Service<
    MethodService<Id, "claims"> & { readonly claims: Types.Invariant<Claims["Type"]> },
    {
      readonly resolve: (input: {
        readonly subjectId: SubjectId;
        readonly credential: PasswordCredentialSnapshot;
      }) => Effect.Effect<Claims["Type"], PasswordUnavailable>;
    }
  >(`effect-auth/password/${moduleId}/Claims`);

  const RegisterInput = Schema.Struct({
    requestId: PasswordCommandId,
    email: BoundedEmail,
    newPassword: Password,
    registration: RegistrationCodec,
  });

  const SignInInput = Schema.Struct({ flowId: FlowId, ...PasswordSignInInput.fields });

  const ActionInput = {
    commandId: PasswordCommandId,
    newPassword: Password,
    actionProof: Schema.optionalKey(OpaqueProof),
  };

  const AddInput = Schema.Struct(ActionInput);
  const ChangeInput = Schema.Struct({ ...ActionInput, currentPassword: Password });
  const ResetBase = { flowId: FlowId, email: BoundedEmail };

  const RequestResetInput = Schema.Struct({
    ...ResetBase,
    requestId: ProofRequestId,
    locale: Locale,
  });

  const VerifyResetInput = Schema.Struct({
    ...ResetBase,
    reference: ProofReference,
    secret: OpaqueProof,
  });

  const CompleteResetInput = Schema.Struct({
    ...ResetBase,
    ...ActionInput,
    continuationId: ProofContinuationId,
    credential: OpaqueProof,
  });

  const Failure = Schema.Union([
    PasswordRejected,
    PasswordUnavailable,
    PasswordActionRequired,
    PasswordMethodUnsupported,
    NewPasswordRejected,
    PasswordCheckUnavailable,
    HookDenied,
  ]);

  type Failure = typeof Failure.Type;
  type MutationValue = AuthOperationResult<
    typeof MutationResult.Type | { readonly _tag: "Rejected" }
  >;
  type Mutation = {
    readonly input: PasswordMutationInput;
    readonly prepare: PreparePasswordCommit<"changed" | "rejected", MutationValue>;
  };
  type Plan<A, Owner = PasswordPersistence> = {
    readonly commit: Effect.Effect<PreparedCommit<A>, Failure, Owner>;
  };

  const Passwords = Context.Service<
    MethodService<Id, "method"> & {
      readonly claims: Types.Invariant<Claims["Type"]>;
      readonly registration: Types.Invariant<Registration["Type"]>;
    },
    {
      readonly planRegister: (
        input: typeof RegisterInput.Type,
      ) => Effect.Effect<
        Plan<typeof RegisterResult.Type, typeof RegistrationAuthority.Identifier>,
        Failure
      >;
      readonly signIn: (
        input: typeof SignInInput.Type,
      ) => Effect.Effect<AuthOperationResult<Completion>, Failure>;
      readonly planAdd: (
        invocation: AuthInvocation,
        input: typeof AddInput.Type,
      ) => Effect.Effect<Plan<MutationValue>, Failure>;
      readonly planChange: (
        invocation: AuthInvocation,
        input: typeof ChangeInput.Type,
      ) => Effect.Effect<Plan<MutationValue>, Failure>;
      readonly requestReset: (
        input: typeof RequestResetInput.Type,
      ) => Effect.Effect<ProofRequestReceipt, Failure>;
      readonly verifyReset: (
        input: typeof VerifyResetInput.Type,
      ) => Effect.Effect<
        AuthOperationResult<{ readonly continuation: ProofContinuation }>,
        Failure
      >;
      readonly planReset: (
        invocation: AuthInvocation,
        input: typeof CompleteResetInput.Type,
      ) => Effect.Effect<Plan<MutationValue>, Failure>;
      readonly status: (invocation: AuthInvocation) => Effect.Effect<typeof Status.Type, Failure>;
      readonly cleanup: (limit: number) => Effect.Effect<typeof Cleanup.Type, Failure>;
    }
  >(`effect-auth/password/${moduleId}/Method`);

  const layer = Layer.effect(
    Passwords,
    Effect.gen(function* () {
      if (!Schema.is(Schema.NonEmptyString.check(Schema.isMaxLength(128)))(moduleId))
        return yield* PasswordMethodConfigurationError.make({});
      const policy = yield* validatePasswordMethodPolicy(policyInput);
      const store = yield* PasswordPersistence;
      const hasher = yield* PasswordHashing;
      const checker = yield* NewPasswordCheck;
      const actionEvidence = yield* PasswordActionEvidence;
      const claims = yield* SessionClaims;
      const authority = yield* AuthenticationAuthority;
      const completion = yield* sessions.AuthenticationCompletion;
      const strategy = yield* sessions.SessionStrategy;
      const proofs = yield* reset.Proofs;
      const hooks = yield* LifecycleHooks;
      const crypto = yield* Crypto.Crypto;

      const services = yield* Effect.context<
        Registration["DecodingServices"] | Registration["EncodingServices"]
      >();

      const registrationCodec = Schema.toCodecIso(RegistrationCodec);

      const preparationServices = Context.make(PasswordPersistence, store).pipe(
        Context.add(PasswordHashing, hasher),
        Context.add(NewPasswordCheck, checker),
        Context.add(AuthenticationAuthority, authority),
        Context.add(LifecycleHooks, hooks),
        Context.add(Crypto.Crypto, crypto),
      );

      const preparation = makePasswordPreparation({ moduleId, policy });

      const shared = {
        identifier: preparation.identifier,
        digest: (...args: Parameters<typeof preparation.digest>) =>
          preparation.digest(...args).pipe(Effect.provide(preparationServices)),
        newReplacement: (...args: Parameters<typeof preparation.newReplacement>) =>
          preparation.newReplacement(...args).pipe(Effect.provide(preparationServices)),
        event: (...args: Parameters<typeof preparation.event>) =>
          preparation.event(...args).pipe(Effect.provide(preparationServices)),
        verifyPassword: (...args: Parameters<typeof preparation.verifyPassword>) =>
          preparation.verifyPassword(...args).pipe(Effect.provide(preparationServices)),
      };

      const { digest, identifier, newReplacement, event, verifyPassword } = shared;

      const recoveryBinding = Effect.fn("Passwords.recoveryBinding")(function* (request: {
        readonly flowId: AuthenticationFlowId;
        readonly email: Email;
      }) {
        const id = identifier(request.email);

        const target = yield* store
          .recoveryTarget({ moduleId, identifier: id })
          .pipe(
            Effect.flatMap((value) =>
              Option.isNone(value)
                ? Effect.succeed(Option.none<PasswordCredentialSnapshot>())
                : snapshotPasswordCredential(value.value).pipe(Effect.map(Option.some)),
            ),
          );

        const base = {
          flowId: request.flowId,
          contextDigest: yield* digest([
            "effect-auth/password-reset/v1",
            moduleId,
            request.flowId,
            request.email,
          ]),
          identifier: id,
        };

        if (Option.isNone(target))
          return { binding: { _tag: "Identifier" as const, ...base }, target };
        if (
          target.value.identifierVerifiedAtMillis === undefined ||
          target.value.identifier.value !== request.email ||
          target.value.identifier.namespace !== "email" ||
          target.value.moduleId !== moduleId
        )
          return yield* PasswordUnavailable.make({});

        return {
          binding: { _tag: "Subject" as const, ...base, revision: target.value.revision },
          target,
        };
      });

      const planMutation = Effect.fn("Passwords.planMutation")(function* (
        action: PasswordAction,
        invocation: AuthInvocation,
        request: typeof AddInput.Type,
        expectedRevision: AuthenticationEvidence["revision"],
        credential?: PasswordCredentialSnapshot,
        currentPasswordEvidence?: AuthenticationEvidence,
        recovery?: import("../../proofs/completion").ProofCompletionPlan,
      ): Effect.fn.Return<Mutation, Failure> {
        if (
          policy.requireImmediateInvalidation &&
          strategy.capabilities.subjectInvalidation !== "immediate"
        )
          return yield* PasswordMethodUnsupported.make({});
        expectedRevision = snapshotPasswordRevision(expectedRevision);

        const replacement = yield* newReplacement(
          request.newPassword,
          credential?.identifier.value as Email | undefined,
        );

        const privateBinding = yield* digest([
          "effect-auth/password-action/v1",
          moduleId,
          action,
          request.commandId,
          expectedRevision.subjectId,
          expectedRevision.securityRevision,
          credential?.credentialId ?? "",
          ...[...expectedRevision.credentials]
            .sort((a, b) =>
              a.credentialId < b.credentialId ? -1 : a.credentialId > b.credentialId ? 1 : 0,
            )
            .flatMap((item) => [item.credentialId, item.revision]),
          replacement.normalization,
          Redacted.value(replacement.verifier),
        ]);

        const validatedChallenge = PasswordActionChallenge.make({
          moduleId,
          action,
          commandId: request.commandId,
          revision: expectedRevision,
          ...(credential === undefined ? {} : { targetCredentialId: credential.credentialId }),
          bindingDigest: privateBinding,
        });

        const challenge = Object.freeze({
          ...validatedChallenge,
          revision: snapshotPasswordRevision(validatedChallenge.revision),
        });

        const granted = yield* actionEvidence.verify({
          challenge,
          invocation,
          ...(request.actionProof === undefined ? {} : { proof: request.actionProof }),
          ...(currentPasswordEvidence === undefined ? {} : { currentPasswordEvidence }),
          ...(recovery === undefined ? {} : { recovery: recovery.input }),
        });

        const evidenceValue = yield* snapshotAuthenticationEvidence(granted.evidence).pipe(
          Effect.mapError(() => PasswordActionRequired.make({})),
        );

        const evidence = {
          ...evidenceValue,
          revision: snapshotPasswordRevision(evidenceValue.revision),
        };

        if (
          evidence.flowId !== AuthenticationFlowId.make(request.commandId) ||
          evidence.bindingDigest !== privateBinding ||
          evidence.revision.subjectId !== expectedRevision.subjectId ||
          evidence.revision.securityRevision !== expectedRevision.securityRevision ||
          expectedRevision.credentials.some(
            (item) =>
              !evidence.revision.credentials.some(
                (verified) =>
                  verified.credentialId === item.credentialId &&
                  verified.revision === item.revision,
              ),
          )
        )
          return yield* PasswordActionRequired.make({});

        const requirement = yield* snapshotPasswordRequirement({
          ...granted.requirement,
          maximumAgeMillis: Math.min(
            granted.requirement.maximumAgeMillis,
            policy.maximumEvidenceAgeMillis,
          ),
        });

        if (
          !(yield* assessAuthentication(evidence, requirement).pipe(
            Effect.mapError(() => PasswordActionRequired.make({})),
          )).satisfied
        )
          return yield* PasswordActionRequired.make({});
        const authorization: PasswordActionAuthorization = { challenge, evidence, requirement };

        const invalidation = sessionInvalidationWindow(
          action === "reset-password" ? "password-reset" : "credential-change",
          strategy.capabilities,
          strategy.policy,
        );

        const changed = yield* event(
          "credential-change",
          credential?.identifier ??
            LoginIdentifier.make({ namespace: "subject", value: expectedRevision.subjectId }),
          expectedRevision.subjectId,
        );

        return {
          input: {
            moduleId,
            commandId: request.commandId,
            expectedRevision,
            ...(credential === undefined ? {} : { credential }),
            replacement,
            authorization,
            invalidation,
          },
          prepare: (decision, journal) => {
            if (decision === "changed") journal.stage(changed);

            // Rejection is a committed VALUE until the caller reads the root receipt.
            return journal.prepare({
              value: decision === "changed" ? { invalidation } : { _tag: "Rejected" as const },
              credentialCommands:
                decision === "changed"
                  ? [
                      { _tag: "Clear" as const, slot: "session" as const },
                      { _tag: "Clear" as const, slot: "pending-proof" as const },
                      ...(action === "reset-password"
                        ? [{ _tag: "Clear" as const, slot: "proof-continuation" as const }]
                        : []),
                    ]
                  : [],
            });
          },
        };
      });

      return Passwords.of({
        planRegister: Effect.fn("Passwords.planRegister")(function* (request) {
          yield* noAmbient();

          const data = yield* Schema.encodeEffect(registrationCodec)(request.registration).pipe(
            Effect.flatMap(Schema.decodeEffect(registrationCodec)),
            Effect.provide(services),
            Effect.mapError(() => PasswordRejected.make({})),
          );

          const replacement = yield* newReplacement(request.newPassword, request.email);
          const id = identifier(request.email);
          const created = yield* event("registration", id);

          const commit = Effect.gen(function* () {
            const owner = yield* RegistrationAuthority;

            return yield* owner.register(
              {
                moduleId,
                requestId: request.requestId,
                identifier: id,
                registration: data,
                replacement,
              },
              (decision, journal) => {
                if (decision._tag === "Created")
                  journal.stage(
                    lifecycleEvent({
                      ...created,
                      snapshot: lifecycleSnapshot({
                        ...created.snapshot,
                        subjectId: decision.subjectId,
                      }),
                    }),
                  );

                return journal.prepare(
                  decision._tag === "Pending"
                    ? { _tag: "ProvisioningPending" as const, reference: decision.reference }
                    : { _tag: "RegistrationAccepted" as const },
                );
              },
            );
          });

          return { commit };
        }),
        signIn: Effect.fn("Passwords.signIn")(function* (request) {
          const verified = yield* verifyPassword(request, "sign-in");

          const credential = yield* snapshotPasswordCredential(verified.credential);

          const values = yield* claims.resolve({
            subjectId: credential.revision.subjectId,
            credential,
          });

          // Settlement is already committed. No physical owner surrounds async session
          // planning; final authority compares the SAME original semantic revisions.
          return yield* completion
            .prepare({ evidence: verified.evidence, claims: values })
            .pipe(Effect.flatMap(read), Effect.mapError(passwordCompletionFailure));
        }),
        planAdd: Effect.fn("Passwords.planAdd")(function* (invocation, request) {
          yield* noAmbient();
          if (invocation._tag !== "Authenticated") return yield* PasswordRejected.make({});
          const caller = invocation;
          const existing = yield* store.readForSubject({ moduleId, subjectId: caller.subjectId });

          if (Option.isSome(existing)) return yield* PasswordRejected.make({});

          const revision = snapshotPasswordRevision(
            yield* authority
              .capture(caller.subjectId, [])
              .pipe(Effect.mapError(passwordCompletionFailure)),
          );

          const plan = yield* planMutation("add-password", invocation, request, revision);

          const commit = Effect.gen(function* () {
            const owner = yield* PasswordPersistence;

            return yield* owner.addIfAbsent(plan.input, plan.prepare);
          });

          return { commit };
        }),
        planChange: Effect.fn("Passwords.planChange")(function* (invocation, request) {
          yield* noAmbient();
          if (invocation._tag !== "Authenticated") return yield* PasswordRejected.make({});
          const caller = invocation;
          const existing = yield* store.readForSubject({ moduleId, subjectId: caller.subjectId });

          if (Option.isNone(existing)) return yield* PasswordRejected.make({});

          const verified = yield* verifyPassword(
            {
              flowId: AuthenticationFlowId.make(request.commandId),
              email: existing.value.identifier.value as Email,
              password: request.currentPassword,
            },
            "change",
            caller.subjectId,
          );

          const plan = yield* planMutation(
            "change-password",
            invocation,
            request,
            verified.evidence.revision,
            verified.credential,
            verified.evidence,
          );

          const commit = Effect.gen(function* () {
            const owner = yield* PasswordPersistence;

            return yield* owner.replaceIfCurrent(plan.input, plan.prepare);
          });

          return { commit };
        }),
        requestReset: Effect.fn("Passwords.requestReset")(function* (request) {
          yield* noAmbient();
          const bound = yield* recoveryBinding(request);

          const dispatch = yield* proofs
            .prepareIssue({
              requestId: request.requestId,
              binding: bound.binding,
              locale: request.locale,
              eligible: Option.isSome(bound.target),
            })
            .pipe(
              Effect.flatMap(readProofCommit),
              Effect.mapError(() => PasswordUnavailable.make({})),
            );

          yield* dispatch.schedule.pipe(Effect.mapError(() => PasswordUnavailable.make({})));

          return dispatch.receipt;
        }),
        verifyReset: Effect.fn("Passwords.verifyReset")(function* (request) {
          yield* noAmbient();
          const bound = yield* recoveryBinding(request);

          const result = yield* proofs
            .prepareAttempt({
              reference: request.reference,
              binding: bound.binding,
              credential: request.secret,
            })
            .pipe(Effect.flatMap(readProofCommit), Effect.mapError(passwordCompletionFailure));

          if (result.value._tag === "Rejected") return yield* PasswordRejected.make({});

          return {
            value: { continuation: result.value.continuation },
            credentialCommands: result.credentialCommands,
          };
        }),
        planReset: Effect.fn("Passwords.planReset")(function* (invocation, request) {
          yield* noAmbient();
          const bound = yield* recoveryBinding(request);

          if (Option.isNone(bound.target)) return yield* PasswordRejected.make({});

          const proof = yield* proofs
            .planComplete({
              continuationId: request.continuationId,
              binding: bound.binding,
              credential: request.credential,
            })
            .pipe(Effect.mapError(passwordCompletionFailure));

          if (!(yield* store.checkReset(proof.input))) return yield* PasswordRejected.make({});

          const plan = yield* planMutation(
            "reset-password",
            invocation,
            request,
            bound.target.value.revision,
            bound.target.value,
            undefined,
            proof,
          );

          const commit = Effect.gen(function* () {
            const owner = yield* PasswordPersistence;

            return yield* owner.resetWithProof({ ...plan.input, completion: proof }, plan.prepare);
          });

          return { commit };
        }),
        status: Effect.fn("Passwords.status")(function* (invocation) {
          if (invocation._tag !== "Authenticated") return yield* PasswordRejected.make({});
          const caller = invocation;

          return {
            hasPassword: Option.isSome(
              yield* store.readForSubject({ moduleId, subjectId: caller.subjectId }),
            ),
          };
        }),
        cleanup: Effect.fn("Passwords.cleanup")(function* (limit) {
          yield* noAmbient();
          yield* Schema.decodeEffect(
            Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 1000 })),
          )(limit).pipe(Effect.mapError(() => PasswordRejected.make({})));

          return yield* read(
            yield* store.cleanupAttempts({ moduleId, limit }, (result, journal) =>
              journal.prepare(result),
            ),
          );
        }),
      });
    }),
  );

  const Register = makeOperation(`${moduleId}/register`, {
    payload: RegisterInput,
    success: RegisterResult,
    error: Failure,
    access: "any",
    exposure: "public",
    replay: "idempotent",
  });

  const SignIn = makeOperation(`${moduleId}/sign-in`, {
    payload: SignInInput,
    success: sessions.CompletionResult,
    error: Failure,
    access: "any",
    exposure: "public",
    replay: "non-idempotent",
    credentials: true,
  });

  const AddPassword = makeOperation(`${moduleId}/add-password`, {
    payload: AddInput,
    success: MutationResult,
    error: Failure,
    access: "authenticated",
    exposure: "public",
    replay: "single-use",
    credentials: true,
  });

  const ChangePassword = makeOperation(`${moduleId}/change-password`, {
    payload: ChangeInput,
    success: MutationResult,
    error: Failure,
    access: "authenticated",
    exposure: "public",
    replay: "single-use",
    credentials: true,
  });

  const RequestReset = makeOperation(`${moduleId}/request-reset`, {
    authorize: () =>
      proofRequestAdmission(`${moduleId}/reset`).pipe(Effect.mapError(passwordCompletionFailure)),
    payload: RequestResetInput,
    success: ProofRequestReceipt,
    error: Failure,
    access: "any",
    exposure: "public",
    replay: "idempotent",
  });

  const VerifyReset = makeOperation(`${moduleId}/verify-reset`, {
    payload: VerifyResetInput,
    success: Schema.Struct({ continuation: ProofContinuation }),
    error: Failure,
    access: "any",
    exposure: "public",
    replay: "single-use",
    credentials: true,
  });

  const CompleteReset = makeOperation(`${moduleId}/complete-reset`, {
    payload: CompleteResetInput,
    success: MutationResult,
    error: Failure,
    access: "any",
    exposure: "public",
    replay: "single-use",
    credentials: true,
  });

  const PasswordStatus = makeOperation(`${moduleId}/status`, {
    payload: Schema.Void,
    success: Status,
    error: Failure,
    access: "authenticated",
    exposure: "public",
    replay: "read-only",
  });

  const CleanupAttempts = makeOperation(`${moduleId}/cleanup`, {
    payload: Schema.Struct({
      limit: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 1000 })),
    }),
    success: Cleanup,
    error: Failure,
    access: "system",
    replay: "idempotent",
  });

  const mutationResult = (
    result: MutationValue,
  ): Effect.Effect<AuthOperationResult<typeof MutationResult.Type>, PasswordRejected> =>
    "invalidation" in result.value
      ? Effect.succeed({ value: result.value, credentialCommands: result.credentialCommands })
      : Effect.fail(PasswordRejected.make({}));

  const handlersLayer = Layer.mergeAll(
    Register.handlerLayer(
      Effect.fn("PasswordOperation.register")(function* (request) {
        return yield* read(yield* (yield* (yield* Passwords).planRegister(request)).commit);
      }),
    ),
    SignIn.credentialHandlerLayer(
      Effect.fn("PasswordOperation.signIn")(function* (request) {
        return yield* (yield* Passwords).signIn(request);
      }),
    ),
    AddPassword.credentialHandlerLayer(
      Effect.fn("PasswordOperation.add")(function* (request, invocation) {
        return yield* read(
          yield* (yield* (yield* Passwords).planAdd(invocation, request)).commit,
        ).pipe(Effect.flatMap(mutationResult));
      }),
    ),
    ChangePassword.credentialHandlerLayer(
      Effect.fn("PasswordOperation.change")(function* (request, invocation) {
        return yield* read(
          yield* (yield* (yield* Passwords).planChange(invocation, request)).commit,
        ).pipe(Effect.flatMap(mutationResult));
      }),
    ),
    RequestReset.handlerLayer(
      Effect.fn("PasswordOperation.requestReset")(function* (request) {
        return yield* (yield* Passwords).requestReset(request);
      }),
    ),
    VerifyReset.credentialHandlerLayer(
      Effect.fn("PasswordOperation.verifyReset")(function* (request) {
        return yield* (yield* Passwords).verifyReset(request);
      }),
    ),
    CompleteReset.credentialHandlerLayer(
      Effect.fn("PasswordOperation.reset")(function* (request, invocation) {
        return yield* read(
          yield* (yield* (yield* Passwords).planReset(invocation, request)).commit,
        ).pipe(Effect.flatMap(mutationResult));
      }),
    ),
    PasswordStatus.handlerLayer(
      Effect.fn("PasswordOperation.status")(function* (_, invocation) {
        return yield* (yield* Passwords).status(invocation);
      }),
    ),
    CleanupAttempts.handlerLayer(
      Effect.fn("PasswordOperation.cleanup")(function* (request) {
        return yield* (yield* Passwords).cleanup(request.limit);
      }),
    ),
  );

  const operations = {
    Register,
    SignIn,
    AddPassword,
    ChangePassword,
    RequestReset,
    VerifyReset,
    CompleteReset,
    PasswordStatus,
    CleanupAttempts,
  };

  return Object.freeze({
    persistence: Object.freeze({ kind: "password" as const, moduleId, management: true as const }),
    strategy: makeAuthStrategy(
      {
        signIn: Effect.fn("Passwords.signInRequest")(function* (
          invocation: AuthInvocation,
          request: Omit<typeof SignInInput.Encoded, "flowId">,
        ) {
          const crypto = yield* Crypto.Crypto;

          const flowId = yield* crypto.randomUUIDv4.pipe(
            Effect.mapError(() => PasswordUnavailable.make({})),
          );

          return yield* SignIn.invoke(invocation, { ...request, flowId });
        }),
        register: Register.invoke,
        addPassword: AddPassword.invoke,
        changePassword: ChangePassword.invoke,
        requestReset: RequestReset.invoke,
        verifyReset: VerifyReset.invoke,
        completeReset: CompleteReset.invoke,
        passwordStatus: PasswordStatus.invoke,
      },
      handlersLayer.pipe(
        Layer.provide(defaultLayer(Passwords, layer)),
        Layer.provide(defaultLayer(reset.Proofs, reset.emailLayer)),
        Layer.provide([newPasswordLayer, hooksLayer]),
        Layer.provideMerge(cryptoLayer),
        Layer.merge(defaultIngressLayer),
      ),
      { completion: true },
    ),
    prepared: (configuration: PasswordPreparedConfiguration) =>
      makePasswordPrepared(
        moduleId,
        { policy: policyInput, strategy: sessions.SessionStrategy, reset: reset.Proofs },
        configuration,
      ),
    Passwords,
    RegistrationAuthority,
    SessionClaims,
    layer,
    handlersLayer,
    operations,
    reset,
    group: operationGroup(...Object.values(operations)),
  });
};

export function makePasswordMethod<
  const Id extends string,
  const SessionId extends string,
  Claims extends Schema.Codec<unknown, unknown, unknown, unknown>,
  Registration extends Schema.Codec<unknown, unknown, unknown, unknown>,
  const Secret extends ProofSecretPolicy = ProofSecretPolicy,
>(
  moduleId: Id,
  options: Parameters<
    typeof makePasswordWithManagement<Id, SessionId, Claims, Registration, Secret>
  >[1],
): ReturnType<typeof makePasswordWithManagement<Id, SessionId, Claims, Registration, Secret>>;

export function makePasswordMethod<
  const Id extends string,
  const SessionId extends string,
  Claims extends Schema.Codec<unknown, unknown, unknown, unknown>,
>(
  moduleId: Id,
  options: PasswordSignInOptions<SessionId, Claims>,
): ReturnType<typeof makePasswordSignIn<Id, SessionId, Claims>>;

export function makePasswordMethod<
  const Id extends string,
  const SessionId extends string,
  Claims extends Schema.Codec<unknown, unknown, unknown, unknown>,
  Registration extends Schema.Codec<unknown, unknown, unknown, unknown>,
  const Secret extends ProofSecretPolicy = ProofSecretPolicy,
>(
  moduleId: Id,
  options:
    | PasswordSignInOptions<SessionId, Claims>
    | Parameters<typeof makePasswordWithManagement<Id, SessionId, Claims, Registration, Secret>>[1],
) {
  return "registration" in options
    ? makePasswordWithManagement(moduleId, options)
    : makePasswordSignIn(moduleId, options);
}
