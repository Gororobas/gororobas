import {
  Cause,
  Context,
  Crypto,
  DateTime,
  Effect,
  Exit,
  Layer,
  Redacted,
  Result,
  Schema,
} from "effect";
import { Base64Url } from "effect/encoding";

import { LifecycleHooks } from "../hooks/LifecycleHooks";
import { HookDenied, LifecycleEventId, lifecycleEvent, lifecycleSnapshot } from "../hooks/models";
import { IdentityConflict } from "../identity/models";
import type { AuthInvocation } from "../operations/context";
import type { AuthCredentialCommand, AuthOperationResult } from "../operations/credentials";
import { AuthenticationRequired } from "../operations/errors";
import { makeOperation, operationGroup } from "../operations/operation";
import { makeRequestBinding, RequestBindingPublic } from "../operations/requestBinding";
import { TokenDigest } from "../Schema";
import { assessAuthentication } from "../sessions/assurance";
import { AuthenticationFlowId, SecurityRevision } from "../sessions/models";
import { OAuthAccountRevision } from "./accountsModels";
import {
  captureConnectedPolicy,
  connectedBounded,
  connectedCaller,
  connectedGrantResponse,
  connectedProfile,
  connectedRead,
  connectedSafe,
  connectedSame,
  connectedUseAuthorization,
  makeOAuthConnectedAccess,
  validateConnectedPolicy,
  wipeConnectedMaterial,
} from "./connectedAccess";
import { makeOAuthConnectedMaintenance } from "./connectedMaintenance";
import * as M from "./connectedModels";
import { OAuthConnectedActionEvidence } from "./OAuthConnectedActionEvidence";
import { OAuthConnectedPersistence } from "./OAuthConnectedPersistence";
import { OAuthConnectedProtocol } from "./OAuthConnectedProtocol";
import { OAuthConnectedTokenProtector } from "./OAuthConnectedTokenProtector";
import { OAuthConnectedTransactionProtector } from "./OAuthConnectedTransactionProtector";
import { OAuthConnectedUseAuthority } from "./OAuthConnectedUseAuthority";
import { OAuthReturnTargets } from "./OAuthReturnTargets";
import {
  OAuthMethodUnsupported,
  OAuthProtocolRejected,
  OAuthRejected,
  OAuthUnavailable,
} from "./signInErrors";
import {
  OAuthAuthorizationUrl,
  OAuthCallbackResponse,
  OAuthClaimId,
  OAuthExternalIdentity,
  OAuthReturnTarget,
  OAuthSignInAuthorization,
  OAuthTransactionSecrets,
} from "./signInModels";
import { snapshotOAuth, snapshotOAuthSync } from "./signInSnapshot";

const Failure = Schema.Union([
  AuthenticationRequired,
  M.OAuthConnectedActionRequired,
  M.OAuthConnectedBusy,
  M.OAuthConnectedReauthorizationRequired,
  OAuthRejected,
  OAuthUnavailable,
  OAuthMethodUnsupported,
  IdentityConflict,
  HookDenied,
]);

type Failure = typeof Failure.Type;

const capturedSchema = Schema.Struct({
  revision: OAuthAccountRevision,
  target: Schema.optionalKey(M.OAuthConnectedTarget),
});

const preparationSchema = Schema.Struct({
  configuration: M.OAuthConnectedConfiguration,
  authorizationUrl: OAuthAuthorizationUrl,
  secrets: OAuthTransactionSecrets,
});

const encoder = new TextEncoder();
const strings = Schema.fromJsonString(Schema.Array(Schema.String));
const contextJson = Schema.fromJsonString(M.OAuthConnectedTransactionContext);

const clearBinding: ReadonlyArray<AuthCredentialCommand> = Object.freeze([
  Object.freeze({ _tag: "Clear", slot: "request-binding" }),
]);

export interface ConnectedModule<Id extends string> {
  readonly moduleId: Id;
  readonly kind: "oauth-connected";
}

/** Opt-in API access. No login factor/session creation or token-bearing RPC. */
export const makeOAuthConnected = <const Id extends string>(
  moduleId: Id,
  configuration: M.OAuthConnectedPolicy,
) => {
  const binding = makeRequestBinding(moduleId, "oauth-connected");

  const Connected = Context.Service<
    ConnectedModule<Id>,
    {
      /** Retain the generated OAuth context before independent proof verification.
       * Deliver the connected-intent command through the private transport. */
      readonly prepareBegin: (
        invocation: AuthInvocation,
        input: typeof M.OAuthConnectedPrepareBegin.Type,
      ) => Effect.Effect<AuthOperationResult<typeof RequestBindingPublic.Type>, Failure>;
      /** Server-only private-bearer target lookup for a trusted factor adapter.
       * Reuse the same input at begin; never expose or replace this challenge. */
      readonly beginContext: (
        invocation: AuthInvocation,
        input: typeof M.OAuthConnectedBegin.Type,
      ) => Effect.Effect<M.OAuthConnectedActionChallenge, Failure>;
      /** Resolve the original callback target before claiming an independent factor. */
      readonly completeContext: (
        invocation: AuthInvocation,
        input: typeof M.OAuthConnectedComplete.Type,
      ) => Effect.Effect<M.OAuthConnectedActionChallenge, Failure>;
      /** Resolve the current native grant and command target. A later grant/revision
       * change invalidates the proof; a committed command replays via disconnect. */
      readonly disconnectContext: (
        invocation: AuthInvocation,
        input: typeof M.OAuthConnectedDisconnect.Type,
      ) => Effect.Effect<M.OAuthConnectedActionChallenge, Failure>;
      readonly begin: (
        invocation: AuthInvocation,
        input: typeof M.OAuthConnectedBegin.Type,
      ) => Effect.Effect<AuthOperationResult<typeof OAuthSignInAuthorization.Type>, Failure>;
      readonly complete: (
        invocation: AuthInvocation,
        input: typeof M.OAuthConnectedComplete.Type,
      ) => Effect.Effect<AuthOperationResult<typeof M.OAuthConnectedResult.Type>, Failure>;
      readonly list: (
        invocation: AuthInvocation,
        input: typeof M.OAuthConnectedList.Type,
      ) => Effect.Effect<typeof M.OAuthConnectedListResult.Type, Failure>;
      readonly disconnect: (
        invocation: AuthInvocation,
        input: typeof M.OAuthConnectedDisconnect.Type,
      ) => Effect.Effect<typeof M.OAuthConnectedDisconnected.Type, Failure>;
    }
  >()("effect-auth/oauth/" + moduleId.length + ":" + moduleId + "/Connected");

  const captured = captureConnectedPolicy(configuration);

  const layer = Layer.effect(
    Connected,
    Effect.gen(function* () {
      const { id, policy } = yield* validateConnectedPolicy(moduleId, captured);
      const { issue: issueBinding, verify: verifyBinding } = yield* binding.RequestBinding;

      const {
        capture,
        issue,
        prepare: prepareFlow,
        inspectPrepared,
        preflight,
        claim,
        inspectGrant,
        settle,
        list: listRows,
        inspectDisconnect,
        disconnect: disconnectRow,
      } = yield* OAuthConnectedPersistence;

      const { verify: verifyAction } = yield* OAuthConnectedActionEvidence;
      const { authorize: authorizeUse } = yield* OAuthConnectedUseAuthority;
      const { prepareAuthorization, exchangeGrant } = yield* OAuthConnectedProtocol;
      const { seal: sealFlow, open: openFlow } = yield* OAuthConnectedTransactionProtector;
      const { seal: sealTokens, open: openTokens } = yield* OAuthConnectedTokenProtector;
      const { resolve: resolveTarget } = yield* OAuthReturnTargets;
      const { before } = yield* LifecycleHooks;
      const { randomBytes, digest } = yield* Crypto.Crypto;

      const random = Effect.fn("OAuthConnected.random")(function* () {
        const bytes = yield* randomBytes(32).pipe(Effect.mapError(() => OAuthUnavailable.make({})));
        const value = OAuthClaimId.make(Base64Url.encode(bytes));

        bytes.fill(0);

        return value;
      });

      const hash = Effect.fn("OAuthConnected.hash")(function* (value: string) {
        const bytes = yield* digest("SHA-256", encoder.encode(value)).pipe(
          Effect.mapError(() => OAuthUnavailable.make({})),
        );

        return TokenDigest.make(Base64Url.encode(bytes));
      });

      const stateDigest = Effect.fn("OAuthConnected.stateDigest")(function* (
        flowId: typeof M.OAuthConnectedBegin.Type.flowId,
        provider: typeof M.OAuthConnectedTransactionContext.Type.provider,
        secret: Redacted.Redacted<string>,
      ) {
        const raw = Redacted.value(secret);

        if (!/^[A-Za-z0-9_-]{43}$/.test(raw)) return yield* OAuthRejected.make({});
        const bytes = Result.getOrUndefined(Base64Url.decode(raw));

        if (!bytes || bytes.length !== 32 || Base64Url.encode(bytes) !== raw) {
          bytes?.fill(0);

          return yield* OAuthRejected.make({});
        }
        bytes.fill(0);

        return yield* hash(
          Schema.encodeSync(strings)([
            "effect-auth/oauth-connected-state/v1",
            id,
            String(policy.generation),
            provider,
            flowId,
            raw,
          ]),
        );
      });

      const challenge = Effect.fn("OAuthConnected.challenge")(function* (
        action: M.OAuthConnectedActionChallenge["action"],
        flowId: M.OAuthConnectedActionChallenge["flowId"],
        commandId: M.OAuthConnectedActionChallenge["commandId"],
        revision: OAuthAccountRevision,
        intent: string,
      ) {
        const intentDigest = yield* hash(intent);

        return snapshotOAuthSync(M.OAuthConnectedActionChallenge, {
          moduleId: id,
          action,
          flowId,
          commandId,
          revision,
          intentDigest,
          bindingDigest: yield* hash(
            Schema.encodeSync(strings)([
              "effect-auth/oauth-connected-action/v1",
              id,
              action,
              flowId,
              commandId,
              intentDigest,
            ]),
          ),
        });
      });

      const authorize = Effect.fn("OAuthConnected.authorize")(function* (
        caller: Effect.Success<ReturnType<typeof connectedCaller>>,
        expected: M.OAuthConnectedActionChallenge,
        proof: Redacted.Redacted<string> | undefined,
        maximumAge = policy.maximumEvidenceAgeMillis,
      ) {
        const granted = yield* verifyAction({
          invocation: { ...caller },
          challenge: snapshotOAuthSync(M.OAuthConnectedActionChallenge, expected),
          ...(proof === undefined ? {} : { proof: Redacted.make(Redacted.value(proof)) }),
        });

        const authorization = yield* snapshotOAuth(M.OAuthConnectedActionAuthorization, {
          challenge: expected,
          evidence: granted.evidence,
          requirement: {
            ...granted.requirement,
            maximumAgeMillis: Math.min(
              maximumAge,
              policy.maximumEvidenceAgeMillis,
              granted.requirement.maximumAgeMillis,
            ),
          },
        }).pipe(Effect.mapError(() => M.OAuthConnectedActionRequired.make({})));

        const evidence = authorization.evidence;

        if (
          evidence.flowId !== AuthenticationFlowId.make(expected.flowId) ||
          evidence.bindingDigest !== expected.bindingDigest ||
          !connectedSame(OAuthAccountRevision, evidence.revision, expected.revision) ||
          new Set(evidence.revision.credentials.map((v) => v.credentialId)).size !==
            evidence.revision.credentials.length ||
          !(yield* assessAuthentication(evidence, authorization.requirement).pipe(
            Effect.mapError(() => M.OAuthConnectedActionRequired.make({})),
          )).satisfied
        )
          return yield* M.OAuthConnectedActionRequired.make({});

        return authorization;
      });

      const binderError = (error: { readonly _tag: string }) =>
        error._tag === "RequestBindingInvalid" ? OAuthRejected.make({}) : OAuthUnavailable.make({});

      const eventFor = Effect.fn("OAuthConnected.event")(function* (
        operation: "connect" | "disconnect",
        subjectId: OAuthAccountRevision["subjectId"],
      ) {
        const snapshot = lifecycleSnapshot({
          action: "linking",
          operation: moduleId + "/connected/" + operation,
          subjectId,
          method: "oauth-connected",
          identifiers: [],
        });

        yield* before(snapshot);

        return lifecycleEvent({
          id: LifecycleEventId.make(yield* random()),
          occurredAtMillis: DateTime.toEpochMillis(yield* DateTime.now),
          snapshot,
        });
      });

      const prepareBegin = Effect.fn("OAuthConnected.prepareBegin")(function* (
        invocation: AuthInvocation,
        raw: typeof M.OAuthConnectedPrepareBegin.Type,
      ) {
        const caller = yield* connectedCaller(invocation);
        const request = yield* snapshotOAuth(M.OAuthConnectedPrepareBegin, raw);

        const found = yield* capture({
          moduleId: id,
          subjectId: caller.subjectId,
          ...(request.intent._tag === "Reconnect" ? { grantId: request.intent.grantId } : {}),
        });

        if (!found) return yield* OAuthRejected.make({});
        const owned = yield* snapshotOAuth(capturedSchema, found);

        if (
          owned.revision.subjectId !== caller.subjectId ||
          (request.intent._tag === "Reconnect" &&
            (!owned.target || owned.target.grantId !== request.intent.grantId))
        )
          return yield* OAuthUnavailable.make({});

        const profile = policy.profiles.find(
          (value) => value.key === request.intent.profileKey && value.issuance === "active",
        );

        const provider =
          request.intent._tag === "Connect"
            ? request.intent.provider
            : owned.target!.identity.provider;

        if (
          !profile ||
          profile.provider !== provider ||
          (request.intent._tag === "Reconnect" &&
            profile.clientRegistrationId !==
              owned.target!.configuration.profile.clientRegistrationId)
        )
          return yield* OAuthRejected.make({});

        const returnTarget = yield* resolveTarget(request.returnTarget).pipe(
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

        const prepared = yield* prepareAuthorization({
          profile: snapshotOAuthSync(M.OAuthConnectedProfile, profile),
          callbackId: request.callbackId,
          flowId: request.flowId,
        }).pipe(
          Effect.mapError((error) =>
            error._tag === "OAuthProtocolRejected" ? OAuthRejected.make({}) : error,
          ),
          Effect.flatMap((value) => snapshotOAuth(preparationSchema, value)),
        );

        if (
          prepared.configuration.provider !== provider ||
          prepared.configuration.callbackId !== request.callbackId ||
          !connectedSame(M.OAuthConnectedProfile, prepared.configuration.profile, profile) ||
          (prepared.configuration.protocol === "oidc") !==
            (prepared.secrets.oidcNonce !== undefined) ||
          (request.intent._tag === "Reconnect" &&
            prepared.configuration.issuer !== owned.target!.identity.issuer)
        )
          return yield* OAuthUnavailable.make({});
        const now = DateTime.toEpochMillis(yield* DateTime.now);
        const expiresAtMillis = Math.min(now + policy.lifetimeMillis, binder.expiresAtMillis);

        if (expiresAtMillis <= now) return yield* OAuthRejected.make({});

        const context = snapshotOAuthSync(M.OAuthConnectedTransactionContext, {
          ...prepared.configuration,
          namespace: "effect-auth/oauth-connected-context/v1",
          moduleId: id,
          generation: policy.generation,
          flowId: request.flowId,
          commandId: request.commandId,
          revision: owned.revision,
          grantId:
            request.intent._tag === "Reconnect"
              ? request.intent.grantId
              : M.OAuthGrantId.make(yield* random()),
          ...(request.intent._tag === "Reconnect" ? { reconnect: owned.target } : {}),
          maximumEvidenceAgeMillis: policy.maximumEvidenceAgeMillis,
          returnTarget,
          stateDigest: yield* stateDigest(request.flowId, provider, prepared.secrets.state),
          requestBindingVerifier: binder.verifier,
          requestBindingExpiresAtMillis: binder.expiresAtMillis,
          issuedAtMillis: now,
          expiresAtMillis,
          claimLifetimeMillis: policy.claimLifetimeMillis,
        });

        const authorization = yield* connectedUseAuthorization(
          yield* authorizeUse({ invocation: caller, moduleId: id, purpose: "metadata" }),
          id,
          caller.subjectId,
          "metadata",
        );

        const sealed = yield* sealFlow({
          context,
          secrets: snapshotOAuthSync(M.OAuthConnectedTransactionSecrets, {
            ...prepared.secrets,
            authorizationUrl: prepared.authorizationUrl,
          }),
        }).pipe(Effect.flatMap((value) => snapshotOAuth(M.OAuthConnectedSealedTransaction, value)));

        const flow = snapshotOAuthSync(M.OAuthConnectedPendingFlow, {
          context,
          sealed,
          retentionUntilMillis: expiresAtMillis + policy.retentionMillis,
        });

        const receipt = yield* prepareFlow(
          { flow: snapshotOAuthSync(M.OAuthConnectedPendingFlow, flow), authorization },
          (value, journal) => {
            const decision = snapshotOAuthSync(M.OAuthConnectedIssueDecision, value);

            if (
              decision._tag === "Issued" &&
              !connectedSame(M.OAuthConnectedPendingFlow, decision.flow, flow)
            )
              throw OAuthUnavailable.make({});

            return journal.prepare(decision._tag === "Issued");
          },
        );

        if (!(yield* connectedRead(receipt))) return yield* OAuthRejected.make({});

        return {
          value: {
            flowId: request.flowId,
            expiresAtMillis,
          },
          credentialCommands: [{ ...command, slot: "connected-intent" as const }],
        };
      }, connectedSafe);

      const preparedBegin = Effect.fn("OAuthConnected.preparedBegin")(function* (
        invocation: AuthInvocation,
        raw: typeof M.OAuthConnectedBegin.Type,
      ) {
        const caller = yield* connectedCaller(invocation);
        const request = yield* snapshotOAuth(M.OAuthConnectedBegin, raw);

        const binder = yield* verifyBinding(request.flowId, request.preparationCredential).pipe(
          Effect.mapError(binderError),
        );

        const access = snapshotOAuthSync(M.OAuthConnectedPreparedAccess, {
          moduleId: id,
          generation: policy.generation,
          subjectId: caller.subjectId,
          flowId: request.flowId,
          commandId: request.commandId,
          requestBindingVerifier: binder.verifier,
          requestBindingExpiresAtMillis: binder.expiresAtMillis,
          nowMillis: DateTime.toEpochMillis(yield* DateTime.now),
        });

        const inspected = yield* inspectPrepared(access);

        if (inspected === undefined) return yield* OAuthRejected.make({});
        const flow = yield* snapshotOAuth(M.OAuthConnectedPendingFlow, inspected);
        const context = flow.context;
        const returnTarget = yield* resolveTarget(request.returnTarget);

        if (
          context.moduleId !== id ||
          context.generation !== policy.generation ||
          context.flowId !== request.flowId ||
          context.commandId !== request.commandId ||
          context.revision.subjectId !== caller.subjectId ||
          context.callbackId !== request.callbackId ||
          context.profile.key !== request.intent.profileKey ||
          !connectedSame(OAuthReturnTarget, context.returnTarget, returnTarget) ||
          context.requestBindingVerifier !== binder.verifier ||
          context.requestBindingExpiresAtMillis !== binder.expiresAtMillis ||
          access.nowMillis < context.issuedAtMillis ||
          access.nowMillis >= context.expiresAtMillis ||
          !connectedProfile(policy, context.profile) ||
          (request.intent._tag === "Connect"
            ? context.reconnect !== undefined || context.provider !== request.intent.provider
            : context.reconnect === undefined || context.grantId !== request.intent.grantId)
        )
          return yield* OAuthRejected.make({});

        const current = yield* capture({
          moduleId: id,
          subjectId: caller.subjectId,
          ...(context.reconnect === undefined ? {} : { grantId: context.grantId }),
        });

        if (
          current === undefined ||
          !connectedSame(OAuthAccountRevision, current.revision, context.revision) ||
          (context.reconnect !== undefined &&
            (current.target === undefined ||
              !connectedSame(M.OAuthConnectedTarget, current.target, context.reconnect)))
        )
          return yield* OAuthRejected.make({});
        const secrets = yield* openFlow({ context, sealed: flow.sealed });

        return {
          caller,
          request,
          flow,
          context,
          authorizationUrl: secrets.authorizationUrl,
        };
      }, connectedSafe);

      const beginChallenge = (context: M.OAuthConnectedTransactionContext) =>
        challenge(
          "connected-begin",
          context.flowId,
          context.commandId,
          context.revision,
          Schema.encodeSync(contextJson)(context),
        );

      const beginContext = Effect.fn("OAuthConnected.beginContext")(function* (
        invocation: AuthInvocation,
        raw: typeof M.OAuthConnectedBegin.Type,
      ) {
        return yield* beginChallenge((yield* preparedBegin(invocation, raw)).context);
      }, connectedSafe);

      const begin = Effect.fn("OAuthConnected.begin")(function* (
        invocation: AuthInvocation,
        raw: typeof M.OAuthConnectedBegin.Type,
      ) {
        const { caller, request, flow, context, authorizationUrl } = yield* preparedBegin(
          invocation,
          raw,
        );

        const authorization = yield* authorize(
          caller,
          yield* beginChallenge(context),
          request.actionProof,
        );

        const receipt = yield* issue({ flow, authorization }, (decision, journal) => {
          if (
            decision._tag === "Issued" &&
            !connectedSame(M.OAuthConnectedPendingFlow, decision.flow, flow)
          )
            throw OAuthUnavailable.make({});

          return journal.prepare(decision._tag === "Issued");
        });

        if (!(yield* connectedRead(receipt))) return yield* OAuthRejected.make({});

        return {
          value: {
            flowId: context.flowId,
            authorizationUrl,
            expiresAtMillis: context.expiresAtMillis,
          },
          credentialCommands: [
            {
              _tag: "Issue" as const,
              slot: "request-binding" as const,
              credential: request.preparationCredential,
              expiresAtMillis: context.requestBindingExpiresAtMillis,
            },
            { _tag: "Clear" as const, slot: "connected-intent" as const },
          ],
        };
      }, connectedSafe);

      const preparedComplete = Effect.fn("OAuthConnected.preparedComplete")(function* (
        invocation: AuthInvocation,
        raw: typeof M.OAuthConnectedComplete.Type,
      ) {
        const caller = yield* connectedCaller(invocation);
        const request = yield* snapshotOAuth(M.OAuthConnectedComplete, raw);
        const response = request.response;

        if (
          encoder.encode(Schema.encodeSync(Schema.fromJsonString(OAuthCallbackResponse))(response))
            .length > 16384
        )
          return yield* OAuthRejected.make({});

        const binder = {
          ...(yield* verifyBinding(request.flowId, request.requestBinding).pipe(
            Effect.mapError(binderError),
          )),
        };

        const access = snapshotOAuthSync(M.OAuthConnectedAccess, {
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

        const inspected = yield* preflight(access);

        if (!inspected) return yield* OAuthRejected.make({});
        const flow = yield* snapshotOAuth(M.OAuthConnectedPendingFlow, inspected);
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
          !connectedProfile(policy, context.profile) ||
          (context.responseIssuerMode === "required"
            ? response.issuer !== context.issuer
            : response.issuer !== undefined)
        )
          return yield* OAuthUnavailable.make({});

        return { caller, request, flow, context, access };
      }, connectedSafe);

      const completeChallenge = (context: M.OAuthConnectedTransactionContext) =>
        challenge(
          "connected-complete",
          context.flowId,
          context.commandId,
          context.revision,
          Schema.encodeSync(contextJson)(context),
        );

      const completeContext = Effect.fn("OAuthConnected.completeContext")(function* (
        invocation: AuthInvocation,
        raw: typeof M.OAuthConnectedComplete.Type,
      ) {
        return yield* completeChallenge((yield* preparedComplete(invocation, raw)).context);
      }, connectedSafe);

      const complete = Effect.fn("OAuthConnected.complete")(function* (
        invocation: AuthInvocation,
        raw: typeof M.OAuthConnectedComplete.Type,
      ) {
        const { caller, request, flow, context, access } = yield* preparedComplete(invocation, raw);
        const response = request.response;

        const authorization = yield* authorize(
          caller,
          yield* completeChallenge(context),
          request.actionProof,
          context.maximumEvidenceAgeMillis,
        );

        const event = yield* eventFor("connect", caller.subjectId);
        const claimId = yield* random();

        const finished = yield* Effect.uninterruptibleMask((restore) =>
          Effect.gen(function* () {
            const receipt = yield* restore(
              claim({ access, flow, claimId, authorization }, (value, journal) =>
                journal.prepare(snapshotOAuthSync(M.OAuthConnectedClaimDecision, value)),
              ),
            );

            const decision = yield* connectedRead(receipt);

            if (decision._tag !== "Claimed") return yield* OAuthRejected.make({});
            const owned = snapshotOAuthSync(M.OAuthConnectedClaim, decision.claim);

            if (
              owned.claimId !== claimId ||
              !connectedSame(M.OAuthConnectedPendingFlow, owned.flow, flow) ||
              owned.claimedAtMillis < context.issuedAtMillis ||
              owned.claimedAtMillis >= context.expiresAtMillis ||
              owned.claimedAtMillis > DateTime.toEpochMillis(yield* DateTime.now) ||
              owned.claimExpiresAtMillis !== owned.claimedAtMillis + context.claimLifetimeMillis ||
              flow.retentionUntilMillis < owned.claimExpiresAtMillis
            )
              return yield* OAuthUnavailable.make({});

            let remoteTokens = false;

            const exchange = Effect.gen(function* () {
              const secrets = yield* openFlow({ context, sealed: flow.sealed }).pipe(
                Effect.flatMap((value) => snapshotOAuth(OAuthTransactionSecrets, value)),
              );

              if (
                (context.protocol === "oidc") !== (secrets.oidcNonce !== undefined) ||
                (yield* stateDigest(context.flowId, context.provider, secrets.state)) !==
                  context.stateDigest ||
                Redacted.value(secrets.state) !== Redacted.value(response.state)
              )
                return yield* OAuthUnavailable.make({});
              if (response._tag !== "Code") return yield* OAuthProtocolRejected.make({});
              const start = DateTime.toEpochMillis(yield* DateTime.now);

              if (start >= owned.claimExpiresAtMillis) return yield* OAuthUnavailable.make({});

              const protocolConfiguration = snapshotOAuthSync(
                M.OAuthConnectedConfiguration,
                context,
              );

              const rawGrant = yield* exchangeGrant({
                configuration: protocolConfiguration,
                secrets,
                response,
                verificationStartedAt: DateTime.makeUnsafe(start),
              });

              const projected = yield* connectedGrantResponse(
                protocolConfiguration,
                rawGrant,
                start,
              );

              remoteTokens = true;

              return yield* Effect.gen(function* () {
                if (
                  (context.reconnect &&
                    !connectedSame(
                      OAuthExternalIdentity,
                      context.reconnect.identity,
                      projected.identity,
                    )) ||
                  (projected.material.continuation._tag === "Oidc" &&
                    (!projected.material.continuation.nonce ||
                      !secrets.oidcNonce ||
                      Redacted.value(projected.material.continuation.nonce) !==
                        Redacted.value(secrets.oidcNonce)))
                )
                  return yield* OAuthProtocolRejected.make({});

                const inspectedGrant = yield* inspectGrant({
                  claim: owned,
                  identity: projected.identity,
                }).pipe(
                  Effect.flatMap((value) => snapshotOAuth(M.OAuthConnectedGrantInspection, value)),
                );

                if (inspectedGrant._tag === "Conflict") return { _tag: "Conflict" as const };
                if (inspectedGrant._tag === "Rejected") return { _tag: "Rejected" as const };

                const tokenContext = snapshotOAuthSync(M.OAuthConnectedTokenContext, {
                  namespace: "effect-auth/oauth-connected-token-context/v1",
                  moduleId: id,
                  subjectId: caller.subjectId,
                  identity: projected.identity,
                  configuration: protocolConfiguration,
                  grantId: context.grantId,
                  exchangeOrder: owned.order,
                  grantVersion: SecurityRevision.make(yield* random()),
                  tokenVersion: SecurityRevision.make(yield* random()),
                  cohortGeneration: inspectedGrant.cohortGeneration,
                  metadata: projected.metadata,
                });

                const sealed = yield* sealTokens({
                  context: tokenContext,
                  material: snapshotOAuthSync(M.OAuthConnectedTokenMaterial, projected.material),
                });

                const grant = snapshotOAuthSync(M.OAuthConnectedStoredGrant, {
                  context: tokenContext,
                  sealed,
                });

                let cleanup: M.OAuthConnectedRevocationJob | undefined;

                if (context.profile.revocation === "cohort") {
                  const cleanupContext = snapshotOAuthSync(M.OAuthConnectedRevocationContext, {
                    namespace: "effect-auth/oauth-connected-revocation-context/v1",
                    jobId: yield* random(),
                    token: tokenContext,
                  });

                  cleanup = snapshotOAuthSync(M.OAuthConnectedRevocationJob, {
                    context: cleanupContext,
                    sealed: yield* sealTokens({
                      context: cleanupContext,
                      material: snapshotOAuthSync(
                        M.OAuthConnectedTokenMaterial,
                        projected.material,
                      ),
                    }),
                  });
                }

                return snapshotOAuthSync(M.OAuthConnectedOutcome, {
                  _tag: inspectedGrant._tag === "Quarantine" ? "Quarantined" : "Verified",
                  grant,
                  ...(cleanup ? { cleanup } : {}),
                });
              }).pipe(
                Effect.ensuring(Effect.sync(() => wipeConnectedMaterial(projected.material))),
              );
            });

            const remaining = Math.max(
              1,
              owned.claimExpiresAtMillis - DateTime.toEpochMillis(yield* DateTime.now),
            );

            const exchanged =
              response._tag === "Error"
                ? undefined
                : yield* Effect.exit(restore(connectedBounded(exchange, remaining)));

            const rejected =
              exchanged &&
              Exit.isFailure(exchanged) &&
              exchanged.cause.reasons.length === 1 &&
              exchanged.cause.reasons[0]?._tag === "Fail" &&
              Schema.is(OAuthProtocolRejected)(exchanged.cause.reasons[0].error);

            const outcome: M.OAuthConnectedOutcome =
              exchanged === undefined
                ? { _tag: "Cancelled" }
                : Exit.isSuccess(exchanged)
                  ? exchanged.value
                  : rejected && !remoteTokens
                    ? { _tag: "Unissued" }
                    : rejected
                      ? { _tag: "Rejected" }
                      : { _tag: "Ambiguous" };

            const committed = yield* connectedBounded(
              settle(
                {
                  claim: owned,
                  outcome,
                  authorization,
                  nowMillis: DateTime.toEpochMillis(yield* DateTime.now),
                },
                (value, journal) => {
                  const result = snapshotOAuthSync(M.OAuthConnectedSettlementDecision, value);

                  if (result._tag === "Connected") {
                    if (
                      outcome._tag !== "Verified" ||
                      !connectedSame(M.OAuthConnectedStoredGrant, result.grant, outcome.grant)
                    )
                      throw OAuthUnavailable.make({});
                    journal.stage(event);
                  } else if (result._tag === "Cancelled" && outcome._tag !== "Cancelled")
                    throw OAuthUnavailable.make({});

                  return journal.prepare(result);
                },
              ),
              policy.settlementTimeoutMillis,
            ).pipe(
              Effect.flatMap(connectedRead),
              Effect.mapError(() => OAuthUnavailable.make({})),
            );

            if (exchanged && Exit.isFailure(exchanged) && Cause.hasInterrupts(exchanged.cause))
              return yield* Effect.interrupt;

            return committed;
          }),
        );

        if (finished._tag === "Ambiguous") return yield* OAuthUnavailable.make({});
        if (finished._tag === "Busy") return yield* M.OAuthConnectedBusy.make({});
        if (finished._tag === "Conflict") return yield* IdentityConflict.make({});
        if (finished._tag === "Rejected") return yield* OAuthRejected.make({});

        return {
          value:
            finished._tag === "Cancelled"
              ? { _tag: "Cancelled" as const, returnTarget: context.returnTarget }
              : {
                  _tag: "Connected" as const,
                  grantId: context.grantId,
                  profileKey: context.profile.key,
                  status: "Active" as const,
                  returnTarget: context.returnTarget,
                },
          credentialCommands: clearBinding,
        };
      }, connectedSafe);

      const list = Effect.fn("OAuthConnected.list")(function* (
        invocation: AuthInvocation,
        raw: typeof M.OAuthConnectedList.Type,
      ) {
        const caller = yield* connectedCaller(invocation);
        const input = yield* snapshotOAuth(M.OAuthConnectedList, raw);

        const authorization = yield* connectedUseAuthorization(
          yield* authorizeUse({ invocation: caller, moduleId: id, purpose: "metadata" }),
          id,
          caller.subjectId,
          "metadata",
        );

        const result = yield* listRows({ authorization, ...input }).pipe(
          Effect.flatMap((value) => snapshotOAuth(M.OAuthConnectedListResult, value)),
        );

        if (
          result.items.length > input.limit ||
          new Set(result.items.map((v) => v.grantId)).size !== result.items.length
        )
          return yield* OAuthUnavailable.make({});

        return result;
      }, connectedSafe);

      const preparedDisconnect = Effect.fn("OAuthConnected.preparedDisconnect")(function* (
        invocation: AuthInvocation,
        raw: typeof M.OAuthConnectedDisconnect.Type,
      ) {
        const caller = yield* connectedCaller(invocation);
        const request = yield* snapshotOAuth(M.OAuthConnectedDisconnect, raw);

        const metadataAuthorization = yield* connectedUseAuthorization(
          yield* authorizeUse({ invocation: caller, moduleId: id, purpose: "metadata" }),
          id,
          caller.subjectId,
          "metadata",
        );

        const inspected = yield* inspectDisconnect({
          moduleId: id,
          subjectId: caller.subjectId,
          authorization: metadataAuthorization,
          commandId: request.commandId,
          grantId: request.grantId,
        }).pipe(
          Effect.flatMap((value) => snapshotOAuth(M.OAuthConnectedDisconnectInspection, value)),
        );

        return { caller, request, inspected };
      }, connectedSafe);

      const disconnectChallenge = (
        request: typeof M.OAuthConnectedDisconnect.Type,
        inspected: Extract<
          typeof M.OAuthConnectedDisconnectInspection.Type,
          { readonly _tag: "Target" }
        >,
      ) =>
        challenge(
          "connected-disconnect",
          M.OAuthConnectedActionChallenge.fields.flowId.make(request.commandId),
          request.commandId,
          inspected.revision,
          Schema.encodeSync(Schema.fromJsonString(M.OAuthConnectedDisconnectGrant))(
            inspected.grant,
          ),
        );

      const disconnectContext = Effect.fn("OAuthConnected.disconnectContext")(function* (
        invocation: AuthInvocation,
        raw: typeof M.OAuthConnectedDisconnect.Type,
      ) {
        const { request, inspected } = yield* preparedDisconnect(invocation, raw);

        if (inspected._tag === "Conflict") return yield* IdentityConflict.make({});
        if (inspected._tag !== "Target") return yield* OAuthRejected.make({});

        return yield* disconnectChallenge(request, inspected);
      }, connectedSafe);

      const disconnect = Effect.fn("OAuthConnected.disconnect")(function* (
        invocation: AuthInvocation,
        raw: typeof M.OAuthConnectedDisconnect.Type,
      ) {
        const { caller, request, inspected } = yield* preparedDisconnect(invocation, raw);

        if (inspected._tag === "Rejected") return yield* OAuthRejected.make({});
        if (inspected._tag === "Conflict") return yield* IdentityConflict.make({});
        if (inspected._tag === "Replay") {
          if (inspected.result.grantId !== request.grantId || !inspected.result.replayed)
            return yield* OAuthUnavailable.make({});

          return inspected.result;
        }

        const grant = inspected.grant,
          context = grant.context;

        if (
          context.moduleId !== id ||
          context.subjectId !== caller.subjectId ||
          context.grantId !== request.grantId ||
          inspected.revision.subjectId !== caller.subjectId
        )
          return yield* OAuthUnavailable.make({});

        const authorization = yield* authorize(
          caller,
          yield* disconnectChallenge(request, inspected),
          request.actionProof,
        );

        const event = yield* eventFor("disconnect", caller.subjectId);
        let revocation: M.OAuthConnectedRevocationJob | undefined;

        if (grant.sealed && context.configuration.profile.revocation === "cohort") {
          const material = yield* openTokens({ context, sealed: grant.sealed }).pipe(
            Effect.flatMap((value) => snapshotOAuth(M.OAuthConnectedTokenMaterial, value)),
          );

          revocation = yield* Effect.gen(function* () {
            const jobContext = snapshotOAuthSync(M.OAuthConnectedRevocationContext, {
              namespace: "effect-auth/oauth-connected-revocation-context/v1",
              jobId: yield* random(),
              token: context,
            });

            return snapshotOAuthSync(M.OAuthConnectedRevocationJob, {
              context: jobContext,
              sealed: yield* sealTokens({ context: jobContext, material }),
            });
          }).pipe(Effect.ensuring(Effect.sync(() => wipeConnectedMaterial(material))));
        }

        const receipt = yield* disconnectRow(
          {
            moduleId: id,
            commandId: request.commandId,
            grant,
            authorization,
            ...(revocation ? { revocation } : {}),
            retentionUntilMillis:
              DateTime.toEpochMillis(yield* DateTime.now) + policy.retentionMillis,
          },
          (value, journal) => {
            const decision = snapshotOAuthSync(M.OAuthConnectedDisconnectDecision, value);

            if (decision._tag === "Disconnected") {
              if (
                decision.grantId !== request.grantId ||
                (!decision.replayed &&
                  context.configuration.profile.revocation === "unsupported" &&
                  decision.remoteRevocation !== "Unsupported") ||
                (!decision.replayed &&
                  revocation !== undefined &&
                  decision.remoteRevocation !== "Pending")
              )
                throw OAuthUnavailable.make({});
              if (!decision.replayed) journal.stage(event);
            }

            return journal.prepare(decision);
          },
        );

        const result = yield* connectedRead(receipt);

        if (result._tag === "Rejected") return yield* OAuthRejected.make({});
        if (result._tag === "Conflict") return yield* IdentityConflict.make({});

        return result;
      }, connectedSafe);

      return Connected.of({
        prepareBegin,
        beginContext,
        completeContext,
        disconnectContext,
        begin,
        complete,
        list,
        disconnect,
      });
    }),
  );

  const PrepareBegin = makeOperation(`${moduleId}/connected/prepare-begin`, {
    payload: M.OAuthConnectedPrepareBegin,
    success: RequestBindingPublic,
    error: Failure,
    access: "authenticated",
    exposure: "public",
    replay: "non-idempotent",
    credentials: true,
  });

  const Begin = makeOperation(`${moduleId}/connected/begin`, {
    payload: M.OAuthConnectedBegin,
    success: OAuthSignInAuthorization,
    error: Failure,
    access: "authenticated",
    exposure: "public",
    replay: "non-idempotent",
    credentials: true,
  });

  const Complete = makeOperation(`${moduleId}/connected/complete`, {
    payload: M.OAuthConnectedComplete,
    success: M.OAuthConnectedResult,
    error: Failure,
    access: "authenticated",
    exposure: "public",
    replay: "single-use",
    credentials: true,
  });

  const List = makeOperation(`${moduleId}/connected/list`, {
    payload: M.OAuthConnectedList,
    success: M.OAuthConnectedListResult,
    error: Failure,
    access: "authenticated",
    exposure: "public",
    replay: "read-only",
  });

  const Disconnect = makeOperation(`${moduleId}/connected/disconnect`, {
    payload: M.OAuthConnectedDisconnect,
    success: M.OAuthConnectedDisconnected,
    error: Failure,
    access: "authenticated",
    exposure: "public",
    replay: "idempotent",
  });

  const handlersLayer = Layer.mergeAll(
    PrepareBegin.credentialHandlerLayer((input, invocation) =>
      Effect.flatMap(Connected, (connected) => connected.prepareBegin(invocation, input)),
    ),
    Begin.credentialHandlerLayer(
      Effect.fn("OAuthConnected.Begin")(function* (input, invocation) {
        return yield* (yield* Connected).begin(invocation, input);
      }),
    ),
    Complete.credentialHandlerLayer(
      Effect.fn("OAuthConnected.Complete")(function* (input, invocation) {
        return yield* (yield* Connected).complete(invocation, input);
      }),
    ),
    List.handlerLayer(
      Effect.fn("OAuthConnected.List")(function* (input, invocation) {
        return yield* (yield* Connected).list(invocation, input);
      }),
    ),
    Disconnect.handlerLayer(
      Effect.fn("OAuthConnected.Disconnect")(function* (input, invocation) {
        return yield* (yield* Connected).disconnect(invocation, input);
      }),
    ),
  );

  return Object.freeze({
    Connected,
    binding,
    layer,
    operations: Object.freeze({ PrepareBegin, Begin, Complete, List, Disconnect }),
    handlersLayer,
    group: operationGroup(PrepareBegin, Begin, Complete, List, Disconnect),
    ...makeOAuthConnectedAccess(moduleId, configuration),
    ...makeOAuthConnectedMaintenance(moduleId, configuration),
  });
};
