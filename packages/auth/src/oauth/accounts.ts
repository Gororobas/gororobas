import {
  Cause,
  Context,
  Crypto,
  DateTime,
  Effect,
  Exit,
  Fiber,
  Layer,
  Redacted,
  Result,
  Schema,
} from "effect";
import { Base64Url } from "effect/encoding";

import { hasCommitScope, type PreparedCommit } from "../hooks/commit";
import { LifecycleHooks } from "../hooks/LifecycleHooks";
import { HookDenied, LifecycleEventId, lifecycleEvent, lifecycleSnapshot } from "../hooks/models";
import { IdentityConflict, LastSignInMethod } from "../identity/models";
import { reportAuthFailure } from "../internal/diagnostics";
import {
  AuthenticationAssurance,
  AssuranceEvidence,
  requireAuthenticated,
  type AuthInvocation,
} from "../operations/context";
import type { AuthOperationResult, AuthCredentialCommand } from "../operations/credentials";
import { AuthenticationRequired } from "../operations/errors";
import { makeOperation, operationGroup } from "../operations/operation";
import { makeRequestBinding } from "../operations/requestBinding";
import { TokenDigest } from "../Schema";
import { assessAuthentication } from "../sessions/assurance";
import { SessionInvalidationWindow, sessionInvalidationWindow } from "../sessions/invalidation";
import { AuthenticationFlowId } from "../sessions/models";
import type { makeSessionModule } from "../sessions/module";
import {
  OAuthAccountRevision,
  OAuthAccountsPolicy,
  OAuthActionAuthorization,
  OAuthActionChallenge,
  OAuthActionRequired,
  OAuthLinkAccess,
  OAuthLinkBegin,
  OAuthLinkClaim,
  OAuthLinkClaimDecision,
  OAuthLinkComplete,
  OAuthLinkDecision,
  OAuthLinkIssueDecision,
  OAuthLinkOutcome,
  OAuthLinkPendingFlow,
  OAuthLinkResult,
  OAuthLinkTransactionContext,
  OAuthUnlink,
  OAuthUnlinkDecision,
  OAuthUnlinked,
  OAuthUnlinkInspection,
} from "./accountsModels";
import { OAuthAccountsPersistence } from "./OAuthAccountsPersistence";
import { OAuthActionEvidence } from "./OAuthActionEvidence";
import { OAuthLinkTransactionProtector } from "./OAuthLinkTransactionProtector";
import { OAuthProtocol } from "./OAuthProtocol";
import { OAuthReturnTargets } from "./OAuthReturnTargets";
import {
  OAuthConfigurationError,
  OAuthMethodUnsupported,
  OAuthProtocolRejected,
  OAuthRejected,
  OAuthUnavailable,
} from "./signInErrors";
import {
  OAuthCallbackResponse,
  OAuthClaimId,
  OAuthCleanupInput,
  OAuthCredentialSnapshot,
  OAuthModuleId,
  OAuthProtocolConfiguration,
  OAuthProtocolPreparation,
  OAuthReturnTarget,
  OAuthSealedTransaction,
  OAuthSignInAuthorization,
  OAuthTransactionSecrets,
  OAuthVerifiedExternalIdentity,
} from "./signInModels";
import { snapshotOAuth, snapshotOAuthSync } from "./signInSnapshot";

const Failure = Schema.Union([
  AuthenticationRequired,
  OAuthActionRequired,
  OAuthRejected,
  OAuthUnavailable,
  OAuthMethodUnsupported,
  IdentityConflict,
  LastSignInMethod,
  HookDenied,
]);

type Failure = typeof Failure.Type;

const invocationSchema = Schema.TaggedStruct("Authenticated", {
  subjectId: OAuthAccountRevision.fields.subjectId,
  sessionId: Schema.optionalKey(Schema.String.check(Schema.isMaxLength(256))),
  assurance: Schema.Struct({
    ...AuthenticationAssurance.fields,
    method: Schema.NonEmptyString.check(Schema.isMaxLength(128)),
    factors: AuthenticationAssurance.fields.factors.check(Schema.isMaxLength(8)),
    evidence: Schema.optionalKey(
      Schema.NonEmptyArray(
        Schema.Struct({
          ...AssuranceEvidence.fields,
          method: Schema.NonEmptyString.check(Schema.isMaxLength(128)),
          factors: AssuranceEvidence.fields.factors.check(Schema.isMaxLength(8)),
        }),
      ).check(Schema.isMaxLength(64)),
    ),
  }),
});

const cleanupResult = Schema.Struct({
  terminalized: Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 1000 })),
  removed: Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 1000 })),
  hasMore: Schema.Boolean,
});

const read = <A>(receipt: PreparedCommit<A>) =>
  receipt.read.pipe(Effect.mapError(() => OAuthUnavailable.make({})));

const noAmbient = Effect.fn("OAuthAccounts.noAmbient")(function* () {
  if (yield* hasCommitScope) return yield* OAuthMethodUnsupported.make({});
});

// Cancellation stays on this fiber and runs finalizers before returning.
// An owner that reached commit may still have committed; its receipt is discarded, never retried.
const bounded = <A, E, R>(effect: Effect.Effect<A, E, R>, millis: number) =>
  Effect.gen(function* () {
    const fiber = yield* effect.pipe(Effect.interruptible, Effect.forkChild);

    return yield* Fiber.join(fiber).pipe(
      Effect.timeout(millis),
      Effect.ensuring(Fiber.interrupt(fiber)),
    );
  });

const encoder = new TextEncoder();
const strings = Schema.fromJsonString(Schema.Array(Schema.String));
const contextJson = Schema.fromJsonString(OAuthLinkTransactionContext);
const flowJson = Schema.fromJsonString(OAuthLinkPendingFlow);
const credentialJson = Schema.fromJsonString(OAuthCredentialSnapshot);
const responseJson = Schema.fromJsonString(OAuthCallbackResponse);
const invalidationJson = Schema.fromJsonString(SessionInvalidationWindow);

const clearChanged: ReadonlyArray<AuthCredentialCommand> = Object.freeze([
  Object.freeze({ _tag: "Clear" as const, slot: "session" as const }),
  Object.freeze({ _tag: "Clear" as const, slot: "pending-proof" as const }),
  Object.freeze({ _tag: "Clear" as const, slot: "proof-continuation" as const }),
  Object.freeze({ _tag: "Clear" as const, slot: "request-binding" as const }),
]);

const clearBinding: ReadonlyArray<AuthCredentialCommand> = Object.freeze([
  Object.freeze({ _tag: "Clear" as const, slot: "request-binding" as const }),
]);

export interface AccountsModule<Id extends string> {
  readonly moduleId: Id;
  readonly kind: "oauth-accounts";
}

/** Authenticated account mutations only; no Claims, registration, login completion
 * or connected-grant authority. Method eligibility and final action policy belong
 * to the same physical persistence authority as each mutation. */
export const makeOAuthAccounts = <
  const Id extends string,
  const SessionId extends string,
  Claims extends Schema.Codec<unknown, unknown, unknown, unknown>,
>(
  moduleId: Id,
  sessions: ReturnType<typeof makeSessionModule<SessionId, Claims>>,
  configuration: OAuthAccountsPolicy,
) => {
  const binding = makeRequestBinding(moduleId, "oauth-link");

  const Accounts = Context.Service<
    AccountsModule<Id>,
    {
      readonly begin: (
        invocation: AuthInvocation,
        input: typeof OAuthLinkBegin.Type,
      ) => Effect.Effect<AuthOperationResult<typeof OAuthSignInAuthorization.Type>, Failure>;
      readonly complete: (
        invocation: AuthInvocation,
        input: typeof OAuthLinkComplete.Type,
      ) => Effect.Effect<AuthOperationResult<typeof OAuthLinkResult.Type>, Failure>;
      readonly unlink: (
        invocation: AuthInvocation,
        input: typeof OAuthUnlink.Type,
      ) => Effect.Effect<AuthOperationResult<typeof OAuthUnlinked.Type>, Failure>;
      readonly cleanup: (
        limit: number,
      ) => Effect.Effect<
        { readonly terminalized: number; readonly removed: number; readonly hasMore: boolean },
        Failure
      >;
    }
  >(`effect-auth/oauth/${moduleId.length}:${moduleId}/Accounts`);

  let captured: OAuthAccountsPolicy | undefined;

  try {
    captured = snapshotOAuthSync(OAuthAccountsPolicy, configuration);
  } catch {
    /* Layer validates. */
  }

  const layer = Layer.effect(
    Accounts,
    Effect.gen(function* () {
      const id = yield* Schema.decodeEffect(OAuthModuleId)(moduleId).pipe(
        Effect.mapError(() => OAuthConfigurationError.make({ reason: "module" })),
      );

      if (captured === undefined) return yield* OAuthConfigurationError.make({ reason: "policy" });
      const policy = captured;
      const { issue: issueBinding, verify: verifyBinding } = yield* binding.RequestBinding;

      const { capture, issue, preflight, claim, settle, inspectUnlink, unlink, cleanup } =
        yield* OAuthAccountsPersistence;

      const { verify: verifyAction } = yield* OAuthActionEvidence;
      const { prepareAuthorization, exchangeVerifiedIdentity } = yield* OAuthProtocol;
      const { resolve: resolveTarget } = yield* OAuthReturnTargets;
      const { seal, open } = yield* OAuthLinkTransactionProtector;
      const { before } = yield* LifecycleHooks;
      const { randomBytes, digest } = yield* Crypto.Crypto;
      const strategy = yield* sessions.SessionStrategy;

      const invalidation = snapshotOAuthSync(
        SessionInvalidationWindow,
        sessionInvalidationWindow("credential-change", strategy.capabilities, strategy.policy),
      );

      const expectedInvalidation = Schema.encodeSync(invalidationJson)(invalidation);

      const available = Effect.fn("OAuthAccounts.available")(function* (
        invocation: AuthInvocation,
      ) {
        yield* noAmbient();
        const caller = yield* requireAuthenticated(invocation);

        if (policy.requireImmediateInvalidation && invalidation.existingSessions !== "immediate")
          return yield* OAuthMethodUnsupported.make({});

        return yield* snapshotOAuth(invocationSchema, caller);
      });

      const hash = Effect.fn("OAuthAccounts.hash")(function* (value: string) {
        const bytes = yield* digest("SHA-256", encoder.encode(value)).pipe(
          Effect.mapError(() => OAuthUnavailable.make({})),
        );

        return TokenDigest.make(Base64Url.encode(bytes));
      });

      const stateDigest = Effect.fn("OAuthAccounts.stateDigest")(function* (
        flowId: typeof OAuthLinkBegin.Type.flowId,
        provider: typeof OAuthLinkBegin.Type.provider,
        secret: Redacted.Redacted<string>,
      ) {
        const raw = Redacted.value(secret);

        if (!/^[A-Za-z0-9_-]{43}$/.test(raw)) return yield* OAuthRejected.make({});
        const bytes = Result.getOrUndefined(Base64Url.decode(raw));

        if (bytes === undefined || bytes.length !== 32 || Base64Url.encode(bytes) !== raw) {
          bytes?.fill(0);

          return yield* OAuthRejected.make({});
        }
        bytes.fill(0);

        return yield* hash(
          Schema.encodeSync(strings)([
            "effect-auth/oauth-link-state/v1",
            id,
            String(policy.generation),
            provider,
            flowId,
            raw,
          ]),
        );
      });

      const challenge = Effect.fn("OAuthAccounts.challenge")(function* (
        action: typeof OAuthActionChallenge.Type.action,
        flowId: typeof OAuthActionChallenge.Type.flowId,
        commandId: typeof OAuthActionChallenge.Type.commandId,
        revision: OAuthAccountRevision,
        intent: string,
      ) {
        const intentDigest = yield* hash(intent);

        return snapshotOAuthSync(OAuthActionChallenge, {
          moduleId: id,
          action,
          flowId,
          commandId,
          revision,
          intentDigest,
          bindingDigest: yield* hash(
            Schema.encodeSync(strings)([
              "effect-auth/oauth-action/v1",
              id,
              action,
              flowId,
              commandId,
              intentDigest,
            ]),
          ),
        });
      });

      const authorize = Effect.fn("OAuthAccounts.authorize")(function* (
        caller: typeof invocationSchema.Type,
        expected: OAuthActionChallenge,
        proof: Redacted.Redacted<string> | undefined,
        maximumAgeMillis = policy.maximumEvidenceAgeMillis,
      ) {
        const grant = yield* verifyAction({
          invocation: snapshotOAuthSync(invocationSchema, caller),
          challenge: snapshotOAuthSync(OAuthActionChallenge, expected),
          ...(proof === undefined ? {} : { proof: Redacted.make(Redacted.value(proof)) }),
        });

        const authorization = yield* snapshotOAuth(OAuthActionAuthorization, {
          challenge: expected,
          evidence: grant.evidence,
          requirement: {
            ...grant.requirement,
            maximumAgeMillis: Math.min(
              policy.maximumEvidenceAgeMillis,
              maximumAgeMillis,
              grant.requirement.maximumAgeMillis,
            ),
          },
        }).pipe(Effect.mapError(() => OAuthActionRequired.make({})));

        const evidence = authorization.evidence;

        if (
          evidence.flowId !== AuthenticationFlowId.make(expected.flowId) ||
          evidence.bindingDigest !== expected.bindingDigest ||
          evidence.revision.subjectId !== expected.revision.subjectId ||
          evidence.revision.securityRevision !== expected.revision.securityRevision ||
          new Set(expected.revision.credentials.map((value) => value.credentialId)).size !==
            expected.revision.credentials.length ||
          expected.revision.credentials.some(
            (a) =>
              !evidence.revision.credentials.some(
                (b) => a.credentialId === b.credentialId && a.revision === b.revision,
              ),
          )
        )
          return yield* OAuthActionRequired.make({});
        if (
          !(yield* assessAuthentication(evidence, authorization.requirement).pipe(
            Effect.mapError(() => OAuthActionRequired.make({})),
          )).satisfied
        )
          return yield* OAuthActionRequired.make({});

        return authorization;
      });

      const binderError = (error: { readonly _tag: string }) =>
        error._tag === "RequestBindingInvalid" ? OAuthRejected.make({}) : OAuthUnavailable.make({});

      const eventFor = Effect.fn("OAuthAccounts.event")(function* (
        action: "linking" | "credential-change",
        subjectId: OAuthAccountRevision["subjectId"],
      ) {
        const snapshot = lifecycleSnapshot({
          action,
          operation: `${moduleId}/accounts/${action === "linking" ? "link" : "unlink"}`,
          subjectId,
          method: "oauth",
          identifiers: [],
        });

        yield* before(snapshot);
        const bytes = yield* randomBytes(32).pipe(Effect.mapError(() => OAuthUnavailable.make({})));

        const event = lifecycleEvent({
          id: LifecycleEventId.make(Base64Url.encode(bytes)),
          occurredAtMillis: DateTime.toEpochMillis(yield* DateTime.now),
          snapshot,
        });

        bytes.fill(0);

        return event;
      });

      const begin = Effect.fn("OAuthAccounts.begin")(
        function* (invocation: AuthInvocation, raw: typeof OAuthLinkBegin.Type) {
          const caller = yield* available(invocation);
          const request = yield* snapshotOAuth(OAuthLinkBegin, raw);
          const found = yield* capture({ moduleId: id, subjectId: caller.subjectId });

          if (found === undefined) return yield* OAuthRejected.make({});
          const revision = yield* snapshotOAuth(OAuthAccountRevision, found);

          if (revision.subjectId !== caller.subjectId) return yield* OAuthUnavailable.make({});

          const target = yield* resolveTarget(request.returnTarget).pipe(
            Effect.flatMap((value) => snapshotOAuth(OAuthReturnTarget, value)),
          );

          const issued = yield* issueBinding(request.flowId).pipe(Effect.mapError(binderError));
          const original = issued.credentialCommands[0];

          if (
            issued.credentialCommands.length !== 1 ||
            original?._tag !== "Issue" ||
            original.slot !== "request-binding" ||
            issued.value.flowId !== request.flowId ||
            original.expiresAtMillis !== issued.value.expiresAtMillis
          )
            return yield* OAuthUnavailable.make({});

          const command = Object.freeze({
            _tag: "Issue" as const,
            slot: "request-binding" as const,
            credential: Redacted.make(Redacted.value(original.credential)),
            expiresAtMillis: original.expiresAtMillis,
          });

          const binder = {
            ...(yield* verifyBinding(
              request.flowId,
              Redacted.make(Redacted.value(command.credential)),
            ).pipe(Effect.mapError(binderError))),
          };

          if (binder.expiresAtMillis !== command.expiresAtMillis)
            return yield* OAuthUnavailable.make({});

          const prepared = yield* prepareAuthorization(
            Object.freeze({
              provider: request.provider,
              ...(request.callbackId === undefined ? {} : { callbackId: request.callbackId }),
              flowId: request.flowId,
            }),
          ).pipe(Effect.flatMap((value) => snapshotOAuth(OAuthProtocolPreparation, value)));

          if (
            prepared.configuration.provider !== request.provider ||
            prepared.configuration.callbackId !== request.callbackId ||
            (prepared.configuration.protocol === "oidc") !==
              (prepared.secrets.oidcNonce !== undefined)
          )
            return yield* OAuthUnavailable.make({});
          const now = DateTime.toEpochMillis(yield* DateTime.now);
          const expiresAtMillis = Math.min(now + policy.lifetimeMillis, binder.expiresAtMillis);

          if (expiresAtMillis <= now) return yield* OAuthRejected.make({});

          const context = snapshotOAuthSync(OAuthLinkTransactionContext, {
            ...prepared.configuration,
            namespace: "effect-auth/oauth-link-context/v1",
            moduleId: id,
            generation: policy.generation,
            flowId: request.flowId,
            commandId: request.commandId,
            revision,
            maximumEvidenceAgeMillis: policy.maximumEvidenceAgeMillis,
            returnTarget: target,
            stateDigest: yield* stateDigest(
              request.flowId,
              request.provider,
              prepared.secrets.state,
            ).pipe(Effect.mapError(() => OAuthUnavailable.make({}))),
            requestBindingVerifier: binder.verifier,
            requestBindingExpiresAtMillis: binder.expiresAtMillis,
            issuedAtMillis: now,
            expiresAtMillis,
            claimLifetimeMillis: policy.claimLifetimeMillis,
          });

          const authorization = yield* authorize(
            caller,
            yield* challenge(
              "link-begin",
              context.flowId,
              context.commandId,
              revision,
              Schema.encodeSync(contextJson)(context),
            ),
            request.actionProof,
          );

          const sealed = yield* seal({
            context: snapshotOAuthSync(OAuthLinkTransactionContext, context),
            secrets: snapshotOAuthSync(OAuthTransactionSecrets, prepared.secrets),
          }).pipe(Effect.flatMap((value) => snapshotOAuth(OAuthSealedTransaction, value)));

          const flow = snapshotOAuthSync(OAuthLinkPendingFlow, {
            context,
            sealed,
            retentionUntilMillis: expiresAtMillis + policy.retentionMillis,
          });

          const expected = Schema.encodeSync(flowJson)(flow);

          const receipt = yield* issue(
            {
              flow: snapshotOAuthSync(OAuthLinkPendingFlow, flow),
              authorization: snapshotOAuthSync(OAuthActionAuthorization, authorization),
            },
            (value, journal) => {
              const decision = snapshotOAuthSync(OAuthLinkIssueDecision, value);

              if (
                decision._tag === "Issued" &&
                Schema.encodeSync(flowJson)(decision.flow) !== expected
              )
                throw OAuthUnavailable.make({});

              return journal.prepare(decision._tag === "Issued");
            },
          );

          if (!(yield* read(receipt))) return yield* OAuthRejected.make({});

          return {
            value: {
              flowId: request.flowId,
              authorizationUrl: prepared.authorizationUrl,
              expiresAtMillis,
            },
            credentialCommands: [command],
          };
        },
        Effect.tapCause((cause) =>
          Cause.hasDies(cause) ? reportAuthFailure("oauth-accounts", cause) : Effect.void,
        ),
        Effect.catchDefect(() => Effect.fail(OAuthUnavailable.make({}))),
      );

      const complete = Effect.fn("OAuthAccounts.complete")(
        function* (invocation: AuthInvocation, raw: typeof OAuthLinkComplete.Type) {
          const caller = yield* available(invocation);
          const request = yield* snapshotOAuth(OAuthLinkComplete, raw);
          const response = request.response;

          if (encoder.encode(Schema.encodeSync(responseJson)(response)).length > 16384)
            return yield* OAuthRejected.make({});

          const binder = {
            ...(yield* verifyBinding(request.flowId, request.requestBinding).pipe(
              Effect.mapError(binderError),
            )),
          };

          const access = snapshotOAuthSync(OAuthLinkAccess, {
            moduleId: id,
            generation: policy.generation,
            subjectId: caller.subjectId,
            flowId: request.flowId,
            provider: request.provider,
            callbackId: request.callbackId,
            stateDigest: yield* stateDigest(request.flowId, request.provider, response.state),
            requestBindingVerifier: binder.verifier,
            requestBindingExpiresAtMillis: binder.expiresAtMillis,
            ...(response.issuer === undefined ? {} : { responseIssuer: response.issuer }),
            nowMillis: DateTime.toEpochMillis(yield* DateTime.now),
          });

          const inspected = yield* preflight(snapshotOAuthSync(OAuthLinkAccess, access));

          if (inspected === undefined) return yield* OAuthRejected.make({});
          const flow = snapshotOAuthSync(OAuthLinkPendingFlow, inspected);
          const context = flow.context;

          if (
            context.moduleId !== id ||
            context.generation !== policy.generation ||
            context.flowId !== request.flowId ||
            context.provider !== request.provider ||
            context.callbackId !== request.callbackId ||
            context.revision.subjectId !== caller.subjectId ||
            context.stateDigest !== access.stateDigest ||
            context.requestBindingVerifier !== binder.verifier ||
            context.requestBindingExpiresAtMillis !== binder.expiresAtMillis ||
            context.expiresAtMillis > binder.expiresAtMillis ||
            access.nowMillis < context.issuedAtMillis ||
            access.nowMillis >= context.expiresAtMillis ||
            (context.responseIssuerMode === "required"
              ? response.issuer !== context.issuer
              : response.issuer !== undefined)
          )
            return yield* OAuthUnavailable.make({});
          const expectedFlow = Schema.encodeSync(flowJson)(flow);

          const authorization = yield* authorize(
            caller,
            yield* challenge(
              "link-complete",
              context.flowId,
              context.commandId,
              context.revision,
              Schema.encodeSync(contextJson)(context),
            ),
            request.actionProof,
            context.maximumEvidenceAgeMillis,
          );

          const event = yield* eventFor("linking", caller.subjectId);

          const bytes = yield* randomBytes(32).pipe(
            Effect.mapError(() => OAuthUnavailable.make({})),
          );

          const claimId = OAuthClaimId.make(Base64Url.encode(bytes));

          bytes.fill(0);

          const finished = yield* Effect.uninterruptibleMask((restore) =>
            Effect.gen(function* () {
              const receipt = yield* restore(
                claim(
                  {
                    access: snapshotOAuthSync(OAuthLinkAccess, access),
                    flow: snapshotOAuthSync(OAuthLinkPendingFlow, flow),
                    claimId,
                    authorization: snapshotOAuthSync(OAuthActionAuthorization, authorization),
                  },
                  (value, journal) =>
                    journal.prepare(snapshotOAuthSync(OAuthLinkClaimDecision, value)),
                ),
              );

              const decision = yield* read(receipt);

              if (decision._tag !== "Claimed") return yield* OAuthRejected.make({});
              const owned = snapshotOAuthSync(OAuthLinkClaim, decision.claim);

              if (
                owned.claimId !== claimId ||
                Schema.encodeSync(flowJson)(owned.flow) !== expectedFlow ||
                owned.claimedAtMillis < context.issuedAtMillis ||
                owned.claimedAtMillis >= context.expiresAtMillis ||
                owned.claimExpiresAtMillis !==
                  owned.claimedAtMillis + context.claimLifetimeMillis ||
                flow.retentionUntilMillis < owned.claimExpiresAtMillis
              )
                return yield* OAuthUnavailable.make({});

              const exchange = Effect.gen(function* () {
                const secrets = yield* open({
                  context: snapshotOAuthSync(OAuthLinkTransactionContext, context),
                  sealed: snapshotOAuthSync(OAuthSealedTransaction, flow.sealed),
                }).pipe(Effect.flatMap((value) => snapshotOAuth(OAuthTransactionSecrets, value)));

                if (
                  (context.protocol === "oidc") !== (secrets.oidcNonce !== undefined) ||
                  (yield* stateDigest(context.flowId, context.provider, secrets.state)) !==
                    context.stateDigest ||
                  Redacted.value(secrets.state) !== Redacted.value(response.state)
                )
                  return yield* OAuthUnavailable.make({});
                if (response._tag !== "Code") return yield* OAuthProtocolRejected.make({});
                const start = yield* DateTime.now;

                if (DateTime.toEpochMillis(start) >= owned.claimExpiresAtMillis)
                  return yield* OAuthUnavailable.make({});

                const identity = yield* exchangeVerifiedIdentity({
                  configuration: snapshotOAuthSync(OAuthProtocolConfiguration, context),
                  response: snapshotOAuthSync(OAuthCallbackResponse, response) as typeof response,
                  secrets: snapshotOAuthSync(OAuthTransactionSecrets, secrets),
                  verificationStartedAt: start,
                }).pipe(
                  Effect.flatMap((value) => snapshotOAuth(OAuthVerifiedExternalIdentity, value)),
                );

                if (
                  identity.identity.provider !== context.provider ||
                  identity.identity.issuer !== context.issuer
                )
                  return yield* OAuthProtocolRejected.make({});

                return identity;
              });

              const remaining = Math.max(
                1,
                owned.claimExpiresAtMillis - DateTime.toEpochMillis(yield* DateTime.now),
              );

              const exchanged =
                response._tag === "Error"
                  ? undefined
                  : yield* Effect.exit(restore(bounded(exchange, remaining)));

              const rejected =
                exchanged !== undefined &&
                Exit.isFailure(exchanged) &&
                exchanged.cause.reasons.length === 1 &&
                exchanged.cause.reasons[0]?._tag === "Fail" &&
                Schema.is(OAuthProtocolRejected)(exchanged.cause.reasons[0].error);

              if (exchanged !== undefined && Exit.isFailure(exchanged) && !rejected)
                yield* reportAuthFailure("oauth-exchange", exchanged.cause);

              const outcome: OAuthLinkOutcome =
                exchanged === undefined
                  ? { _tag: "Cancelled" }
                  : Exit.isSuccess(exchanged)
                    ? { _tag: "Verified", identity: exchanged.value }
                    : rejected
                      ? { _tag: "Rejected" }
                      : { _tag: "Ambiguous" };

              const committed = yield* bounded(
                settle(
                  {
                    claim: snapshotOAuthSync(OAuthLinkClaim, owned),
                    outcome: snapshotOAuthSync(OAuthLinkOutcome, outcome),
                    authorization: snapshotOAuthSync(OAuthActionAuthorization, authorization),
                    invalidation: snapshotOAuthSync(SessionInvalidationWindow, invalidation),
                    nowMillis: DateTime.toEpochMillis(yield* DateTime.now),
                  },
                  (value, journal) => {
                    const decision = snapshotOAuthSync(OAuthLinkDecision, value);

                    if (decision._tag === "Linked") {
                      const c = decision.credential;

                      if (
                        outcome._tag !== "Verified" ||
                        c.moduleId !== id ||
                        c.revision.subjectId !== caller.subjectId ||
                        c.identity.provider !== outcome.identity.identity.provider ||
                        c.identity.issuer !== outcome.identity.identity.issuer ||
                        c.identity.subject !== outcome.identity.identity.subject ||
                        !c.revision.credentials.some(
                          (item) =>
                            item.credentialId === c.credentialId &&
                            item.revision === c.credentialRevision,
                        ) ||
                        new Set(c.revision.credentials.map((item) => item.credentialId)).size !==
                          c.revision.credentials.length ||
                        (decision.changed
                          ? c.revision.securityRevision === context.revision.securityRevision
                          : c.revision.securityRevision !== context.revision.securityRevision)
                      )
                        throw OAuthUnavailable.make({});
                      if (decision.changed) journal.stage(event);
                    } else if (decision._tag === "Conflict") {
                      if (outcome._tag !== "Verified") throw OAuthUnavailable.make({});
                    } else if (decision._tag !== "Rejected" && decision._tag !== outcome._tag)
                      throw OAuthUnavailable.make({});

                    return journal.prepare(decision);
                  },
                ),
                policy.settlementTimeoutMillis,
              ).pipe(
                Effect.flatMap(read),
                Effect.mapError(() => OAuthUnavailable.make({})),
              );

              if (
                exchanged !== undefined &&
                Exit.isFailure(exchanged) &&
                Cause.hasInterrupts(exchanged.cause)
              )
                return yield* Effect.interrupt;

              return committed;
            }),
          );

          if (finished._tag === "Ambiguous") return yield* OAuthUnavailable.make({});
          if (finished._tag === "Conflict") return yield* IdentityConflict.make({});
          if (finished._tag === "Rejected") return yield* OAuthRejected.make({});
          if (finished._tag === "Cancelled")
            return {
              value: { _tag: "Cancelled" as const, returnTarget: context.returnTarget },
              credentialCommands: clearBinding,
            };

          return {
            value: finished.changed
              ? {
                  _tag: "Linked" as const,
                  changed: true as const,
                  credentialId: finished.credential.credentialId,
                  returnTarget: context.returnTarget,
                  invalidation,
                }
              : {
                  _tag: "Linked" as const,
                  changed: false as const,
                  credentialId: finished.credential.credentialId,
                  returnTarget: context.returnTarget,
                },
            credentialCommands: finished.changed ? clearChanged : clearBinding,
          };
        },
        Effect.tapCause((cause) =>
          Cause.hasDies(cause) ? reportAuthFailure("oauth-accounts", cause) : Effect.void,
        ),
        Effect.catchDefect(() => Effect.fail(OAuthUnavailable.make({}))),
      );

      const remove = Effect.fn("OAuthAccounts.unlink")(
        function* (invocation: AuthInvocation, raw: typeof OAuthUnlink.Type) {
          const caller = yield* available(invocation);
          const request = yield* snapshotOAuth(OAuthUnlink, raw);

          const inspection = yield* inspectUnlink(
            Object.freeze({
              moduleId: id,
              subjectId: caller.subjectId,
              commandId: request.commandId,
              credentialId: request.credentialId,
            }),
          ).pipe(Effect.flatMap((value) => snapshotOAuth(OAuthUnlinkInspection, value)));

          if (inspection._tag === "Rejected") return yield* OAuthRejected.make({});
          if (inspection._tag === "Conflict") return yield* IdentityConflict.make({});
          if (inspection._tag === "Replay") {
            if (inspection.result.credentialId !== request.credentialId)
              return yield* OAuthUnavailable.make({});

            return { value: inspection.result, credentialCommands: [] };
          }
          const credential = snapshotOAuthSync(OAuthCredentialSnapshot, inspection.credential);

          if (
            credential.moduleId !== id ||
            credential.credentialId !== request.credentialId ||
            credential.revision.subjectId !== caller.subjectId ||
            !credential.revision.credentials.some(
              (c) =>
                c.credentialId === credential.credentialId &&
                c.revision === credential.credentialRevision,
            )
          )
            return yield* OAuthUnavailable.make({});

          const authorization = yield* authorize(
            caller,
            yield* challenge(
              "unlink",
              OAuthActionChallenge.fields.flowId.make(request.commandId),
              request.commandId,
              credential.revision,
              Schema.encodeSync(credentialJson)(credential),
            ),
            request.actionProof,
          );

          const event = yield* eventFor("credential-change", caller.subjectId);
          const nowMillis = DateTime.toEpochMillis(yield* DateTime.now);

          const receipt = yield* unlink(
            {
              moduleId: id,
              commandId: request.commandId,
              credential: snapshotOAuthSync(OAuthCredentialSnapshot, credential),
              authorization: snapshotOAuthSync(OAuthActionAuthorization, authorization),
              invalidation: snapshotOAuthSync(SessionInvalidationWindow, invalidation),
              nowMillis,
              retentionUntilMillis: nowMillis + policy.retentionMillis,
            },
            (value, journal) => {
              const decision = snapshotOAuthSync(OAuthUnlinkDecision, value);

              if (decision._tag === "Unlinked") {
                if (
                  decision.result.credentialId !== credential.credentialId ||
                  (!decision.replayed &&
                    Schema.encodeSync(invalidationJson)(decision.result.invalidation) !==
                      expectedInvalidation)
                )
                  throw OAuthUnavailable.make({});
                if (!decision.replayed) journal.stage(event);
              }

              return journal.prepare(decision);
            },
          );

          const decision = yield* read(receipt);

          if (decision._tag === "Rejected") return yield* OAuthRejected.make({});
          if (decision._tag === "Conflict") return yield* IdentityConflict.make({});
          if (decision._tag === "LastSignInMethod") return yield* LastSignInMethod.make({});

          return {
            value: decision.result,
            credentialCommands: decision.replayed ? [] : clearChanged,
          };
        },
        Effect.tapCause((cause) =>
          Cause.hasDies(cause) ? reportAuthFailure("oauth-accounts", cause) : Effect.void,
        ),
        Effect.catchDefect(() => Effect.fail(OAuthUnavailable.make({}))),
      );

      return Accounts.of({
        begin,
        complete,
        unlink: remove,
        cleanup: Effect.fn("OAuthAccounts.cleanup")(function* (limit) {
          yield* noAmbient();

          const input = yield* snapshotOAuth(OAuthCleanupInput, {
            moduleId: id,
            limit,
            nowMillis: DateTime.toEpochMillis(yield* DateTime.now),
          });

          const receipt = yield* cleanup(input, (value, journal) => {
            const result = snapshotOAuthSync(cleanupResult, value);

            if (result.terminalized + result.removed > input.limit) throw OAuthUnavailable.make({});

            return journal.prepare(result);
          });

          return yield* read(receipt);
        }),
      });
    }),
  );

  const Begin = makeOperation(`${moduleId}/accounts/link/begin`, {
    payload: OAuthLinkBegin,
    success: OAuthSignInAuthorization,
    error: Failure,
    access: "authenticated",
    exposure: "public",
    replay: "non-idempotent",
    credentials: true,
  });

  const Complete = makeOperation(`${moduleId}/accounts/link/complete`, {
    payload: OAuthLinkComplete,
    success: OAuthLinkResult,
    error: Failure,
    access: "authenticated",
    exposure: "public",
    replay: "single-use",
    credentials: true,
  });

  const Unlink = makeOperation(`${moduleId}/accounts/unlink`, {
    payload: OAuthUnlink,
    success: OAuthUnlinked,
    error: Failure,
    access: "authenticated",
    exposure: "public",
    replay: "idempotent",
    credentials: true,
  });

  const handlersLayer = Layer.mergeAll(
    Begin.credentialHandlerLayer(
      Effect.fn("OAuthAccounts.Link.Begin")(function* (input, invocation) {
        return yield* (yield* Accounts).begin(invocation, input);
      }),
    ),
    Complete.credentialHandlerLayer(
      Effect.fn("OAuthAccounts.Link.Complete")(function* (input, invocation) {
        return yield* (yield* Accounts).complete(invocation, input);
      }),
    ),
    Unlink.credentialHandlerLayer(
      Effect.fn("OAuthAccounts.Unlink")(function* (input, invocation) {
        return yield* (yield* Accounts).unlink(invocation, input);
      }),
    ),
  );

  return Object.freeze({
    Accounts,
    binding,
    layer,
    operations: Object.freeze({ Link: Object.freeze({ Begin, Complete }), Unlink }),
    handlersLayer,
    group: operationGroup(Begin, Complete, Unlink),
  });
};
