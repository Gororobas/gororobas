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
  type Types,
} from "effect";
import { Base64Url } from "effect/encoding";

import { makeAuthStrategy } from "../auth/AuthStrategy";
import { cryptoLayer, defaultLayer, hooksLayer } from "../auth/defaults";
import { hasCommitScope, type PreparedCommit } from "../hooks/commit";
import { HookDenied } from "../hooks/models";
import { reportAuthFailure } from "../internal/diagnostics";
import type { AuthInvocation } from "../operations/context";
import type { AuthOperationResult } from "../operations/credentials";
import { InvalidOperationInput } from "../operations/errors";
import { makeOperation, operationGroup } from "../operations/operation";
import { makeRequestBinding } from "../operations/requestBinding";
import { type SubjectId, TokenDigest } from "../Schema";
import { AuthenticationFlowId } from "../sessions/models";
import type { makeSessionModule } from "../sessions/module";
import { makeOAuthAccounts } from "./accounts";
import type { OAuthAccountsPolicy } from "./accountsModels";
import { makeOAuthConnected } from "./connected";
import { wipeConnectedMaterial } from "./connectedAccess";
import {
  type OAuthConnectedPolicy,
  type OAuthConnectedProfile,
  type OAuthConnectedGrantResponse,
} from "./connectedModels";
import { completionResult } from "./contracts";
import { OAuthProtocol } from "./OAuthProtocol";
import { OAuthRegistrationIntents, OAuthRegistrationSettlement } from "./OAuthRegistrationIntents";
import { OAuthReturnTargets } from "./OAuthReturnTargets";
import { OAuthSignInPersistence, type PrepareOAuthCommit } from "./OAuthSignInPersistence";
import { OAuthTransactionProtector } from "./OAuthTransactionProtector";
import { makeOAuthRegistration } from "./registration";
import { OAuthRegistrationIntent, OAuthRegistrationPolicy } from "./registrationModels";
import * as registrationSecrets from "./registrationSecrets";
import { signInAccess } from "./signInAccess";
import type { OAuthSignInAccessClaim } from "./signInAccessModels";
import {
  OAuthConfigurationError,
  OAuthMethodUnsupported,
  OAuthProtocolRejected,
  OAuthRejected,
  OAuthUnavailable,
} from "./signInErrors";
import {
  OAuthCallbackResponse,
  OAuthClaim,
  OAuthClaimDecision,
  OAuthClaimId,
  OAuthCredentialSnapshot,
  OAuthIssueDecision,
  OAuthModuleId,
  OAuthPendingFlow,
  OAuthProtocolConfiguration,
  OAuthProtocolPreparation,
  OAuthReturnTarget,
  OAuthSealedTransaction,
  OAuthSignInAuthorization,
  OAuthSignInBegin,
  OAuthSignInComplete,
  OAuthSignInInput,
  OAuthSignInPolicy,
  OAuthSignInTransactionContext,
  OAuthTransactionSecrets,
  OAuthVerifiedExternalIdentity,
} from "./signInModels";
import { snapshotOAuth, snapshotOAuthSync } from "./signInSnapshot";

const Failure = Schema.Union([OAuthRejected, OAuthUnavailable, OAuthMethodUnsupported, HookDenied]);

type Failure = typeof Failure.Type;

const noAmbient = Effect.fn("OAuth.noAmbient")(function* () {
  if (yield* hasCommitScope) return yield* OAuthMethodUnsupported.make({});
});

const read = <A>(receipt: PreparedCommit<A>) =>
  receipt.read.pipe(Effect.mapError(() => OAuthUnavailable.make({})));

const encoder = new TextEncoder();

// The wait is bounded. Cancellation stays on this fiber and runs finalizers
// before returning. A timed-out owner may still have committed: its receipt is
// abandoned, never recovered.
const bounded = <A, E, R>(effect: Effect.Effect<A, E, R>, millis: number) =>
  Effect.gen(function* () {
    const fiber = yield* effect.pipe(Effect.interruptible, Effect.forkChild);

    return yield* Fiber.join(fiber).pipe(
      Effect.timeout(millis),
      Effect.ensuring(Fiber.interrupt(fiber)),
    );
  });

const flowJson = Schema.fromJsonString(OAuthPendingFlow);
const contextJson = Schema.fromJsonString(OAuthSignInTransactionContext);
const responseJson = Schema.fromJsonString(OAuthCallbackResponse);

const stateMessage = Schema.fromJsonString(
  Schema.Tuple([
    Schema.Literal("effect-auth/oauth-state/v1"),
    OAuthModuleId,
    OAuthSignInPolicy.fields.generation,
    OAuthSignInBegin.fields.provider,
    OAuthSignInBegin.fields.flowId,
    Schema.String.check(Schema.isPattern(/^[A-Za-z0-9_-]{43}$/)),
  ]),
);

export interface OAuthModule<Id extends string, Kind extends string, Claims> {
  readonly moduleId: Id;
  readonly kind: Kind;
  readonly claims: Types.Invariant<Claims>;
}

/** Guest sign-in only. Durable flow/identity authority, configured protocol,
 * separate transaction encryption and request-binding signing are explicit Layers.
 * This installs no provider, database, registration or connected-token capability.
 */
export const makeOAuthMethod = <
  const Id extends string,
  const SessionId extends string,
  Claims extends Schema.Codec<unknown, unknown, unknown, unknown>,
  Access extends OAuthConnectedProfile | undefined = undefined,
>(
  moduleId: Id,
  options: {
    readonly sessions: ReturnType<typeof makeSessionModule<SessionId, Claims>>;
    readonly access?: Access;
  },
) => {
  const sessions = options.sessions;
  const binding = makeRequestBinding(moduleId, "oauth-entry");

  /** Supply application session claims after provider verification and local account matching. */
  const SessionClaims = Context.Service<
    OAuthModule<Id, "claims", Claims["Type"]>,
    {
      readonly resolve: (input: {
        readonly subjectId: SubjectId;
        readonly credential: OAuthCredentialSnapshot;
        /** Fresh provider metadata. Select claims explicitly; profile email grants no linking authority. */
        readonly identity: OAuthVerifiedExternalIdentity;
      }) => Effect.Effect<Claims["Type"], OAuthUnavailable>;
    }
  >(`effect-auth/oauth/${moduleId.length}:${moduleId}/Claims`);

  const CompletionResult = completionResult(sessions.CompletionResult);

  type CompletionResult = typeof CompletionResult.Type;

  const SignIn = Context.Service<
    OAuthModule<Id, "sign-in", Claims["Type"]>,
    {
      readonly begin: (
        input: typeof OAuthSignInBegin.Type,
      ) => Effect.Effect<AuthOperationResult<typeof OAuthSignInAuthorization.Type>, Failure>;
      readonly complete: (
        input: typeof OAuthSignInComplete.Type,
      ) => Effect.Effect<AuthOperationResult<CompletionResult>, Failure>;
    }
  >(`effect-auth/oauth/${moduleId.length}:${moduleId}/SignIn`);

  const makeSignInLayer = <R>(
    configuration: OAuthSignInPolicy,
    registrationSource: Effect.Effect<
      | {
          readonly settle: OAuthRegistrationIntents["Service"]["settle"];
          readonly policy: OAuthRegistrationPolicy;
        }
      | undefined,
      OAuthConfigurationError,
      R
    >,
  ) => {
    let captured: OAuthSignInPolicy | undefined;

    try {
      captured = snapshotOAuthSync(OAuthSignInPolicy, configuration);
    } catch {
      /* Layer reports configuration failure */
    }

    return Layer.effect(
      SignIn,
      Effect.gen(function* () {
        const id = yield* Schema.decodeEffect(OAuthModuleId)(moduleId).pipe(
          Effect.mapError(() => OAuthConfigurationError.make({ reason: "module" })),
        );

        if (captured === undefined)
          return yield* OAuthConfigurationError.make({ reason: "policy" });
        const policy = captured;
        const registration = yield* registrationSource;
        const access = yield* signInAccess(moduleId, policy, options.access);
        const { issue: issueBinding, verify: verifyBinding } = yield* binding.RequestBinding;
        const { prepareAuthorization, exchangeVerifiedIdentity } = yield* OAuthProtocol;
        const { resolve: returnTarget } = yield* OAuthReturnTargets;
        const { seal, open } = yield* OAuthTransactionProtector;
        const { issue, claim, settle } = yield* OAuthSignInPersistence;
        const { resolve: resolveClaims } = yield* SessionClaims;
        const { prepare: completeAuthentication } = yield* sessions.AuthenticationCompletion;
        const crypto = yield* Crypto.Crypto;
        const { randomBytes, digest } = crypto;

        const hash = Effect.fn("OAuth.hash")(function* (message: string) {
          const result = yield* digest("SHA-256", encoder.encode(message)).pipe(
            Effect.mapError(() => OAuthUnavailable.make({})),
          );

          return TokenDigest.make(Base64Url.encode(result));
        });

        const stateDigest = Effect.fn("OAuth.stateDigest")(function* (
          flowId: typeof OAuthSignInBegin.Type.flowId,
          provider: typeof OAuthSignInBegin.Type.provider,
          state: Redacted.Redacted<string>,
        ) {
          const raw = Redacted.value(state);

          if (!Schema.is(Schema.String.check(Schema.isPattern(/^[A-Za-z0-9_-]{43}$/)))(raw))
            return yield* OAuthRejected.make({});
          const bytes = Result.getOrUndefined(Base64Url.decode(raw));

          if (bytes === undefined || bytes.length !== 32 || Base64Url.encode(bytes) !== raw) {
            bytes?.fill(0);

            return yield* OAuthRejected.make({});
          }
          bytes.fill(0);

          const message = yield* Schema.encodeEffect(stateMessage)([
            "effect-auth/oauth-state/v1",
            id,
            policy.generation,
            provider,
            flowId,
            raw,
          ]).pipe(Effect.mapError(() => OAuthUnavailable.make({})));

          return yield* hash(message);
        });

        const binderError = (error: { readonly _tag: string }) =>
          error._tag === "RequestBindingInvalid"
            ? OAuthRejected.make({})
            : OAuthUnavailable.make({});

        const begin = Effect.fn("OAuth.SignIn.begin")(
          function* (raw: typeof OAuthSignInBegin.Type) {
            yield* noAmbient();
            const request = yield* snapshotOAuth(OAuthSignInBegin, raw);
            const target = yield* returnTarget(request.returnTarget);

            const canonicalTarget = yield* Schema.decodeEffect(OAuthReturnTarget)(target).pipe(
              Effect.mapError(() => OAuthUnavailable.make({})),
            );

            const issuedBinding = yield* issueBinding(request.flowId).pipe(
              Effect.mapError(binderError),
            );

            const original = issuedBinding.credentialCommands[0];

            if (
              issuedBinding.credentialCommands.length !== 1 ||
              original?._tag !== "Issue" ||
              original.slot !== "request-binding" ||
              issuedBinding.value.flowId !== request.flowId ||
              original.expiresAtMillis !== issuedBinding.value.expiresAtMillis
            )
              return yield* OAuthUnavailable.make({});

            const command = Object.freeze({
              _tag: "Issue" as const,
              slot: "request-binding" as const,
              credential: Redacted.make(Redacted.value(original.credential)),
              expiresAtMillis: original.expiresAtMillis,
            });

            const binder = Object.freeze({
              ...(yield* verifyBinding(
                request.flowId,
                Redacted.make(Redacted.value(command.credential)),
              ).pipe(Effect.mapError(binderError))),
            });

            if (binder.expiresAtMillis !== command.expiresAtMillis)
              return yield* OAuthUnavailable.make({});

            const prepared = yield* (access?.prepare ?? prepareAuthorization)(
              Object.freeze({
                provider: request.provider,
                ...(request.callbackId === undefined ? {} : { callbackId: request.callbackId }),
                flowId: request.flowId,
              }),
            ).pipe(Effect.flatMap((value) => snapshotOAuth(OAuthProtocolPreparation, value)));

            if (
              prepared.configuration.provider !== request.provider ||
              (request.callbackId !== undefined &&
                prepared.configuration.callbackId !== request.callbackId) ||
              (prepared.configuration.protocol === "oidc") !==
                (prepared.secrets.oidcNonce !== undefined)
            )
              return yield* OAuthUnavailable.make({});
            const now = DateTime.toEpochMillis(yield* DateTime.now);
            const expiresAtMillis = Math.min(now + policy.lifetimeMillis, binder.expiresAtMillis);

            if (expiresAtMillis <= now) return yield* OAuthRejected.make({});

            const context = yield* snapshotOAuth(OAuthSignInTransactionContext, {
              namespace: "effect-auth/oauth-sign-in-context/v1",
              moduleId: id,
              generation: policy.generation,
              flowId: request.flowId,
              commandId: request.commandId,
              ...prepared.configuration,
              ...(access === undefined ? {} : { access: access.profile }),
              returnTarget: canonicalTarget,
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

            const sealed = yield* seal({
              context: snapshotOAuthSync(OAuthSignInTransactionContext, context),
              secrets: snapshotOAuthSync(OAuthTransactionSecrets, prepared.secrets),
            }).pipe(Effect.flatMap((value) => snapshotOAuth(OAuthSealedTransaction, value)));

            const flow = snapshotOAuthSync(OAuthPendingFlow, {
              context,
              sealed,
              retentionUntilMillis: expiresAtMillis + policy.retentionMillis,
            });

            const expected = Schema.encodeSync(flowJson)(flow);

            type Issuance =
              | { readonly _tag: "Rejected" }
              | {
                  readonly _tag: "Issued";
                  readonly result: AuthOperationResult<typeof OAuthSignInAuthorization.Type>;
                };

            const receipt = yield* issue<Issuance>(
              snapshotOAuthSync(OAuthPendingFlow, flow),
              (decision, journal) => {
                const checked = snapshotOAuthSync(OAuthIssueDecision, decision);

                if (checked._tag === "Rejected")
                  return journal.prepare({ _tag: "Rejected" as const });
                if (Schema.encodeSync(flowJson)(checked.flow) !== expected)
                  throw OAuthUnavailable.make({});

                return journal.prepare({
                  _tag: "Issued" as const,
                  result: Object.freeze({
                    value: Object.freeze({
                      flowId: request.flowId,
                      authorizationUrl: prepared.authorizationUrl,
                      expiresAtMillis,
                    }),
                    credentialCommands: Object.freeze([command]),
                  }),
                });
              },
            );

            const committed = yield* read(receipt);

            if (committed._tag === "Rejected") return yield* OAuthRejected.make({});

            return committed.result;
          },
          Effect.tapCause((cause) =>
            Cause.hasDies(cause) ? reportAuthFailure("oauth-sign-in", cause) : Effect.void,
          ),
          Effect.catchDefect(() => Effect.fail(OAuthUnavailable.make({}))),
        );

        const complete = Effect.fn("OAuth.SignIn.complete")(
          function* (raw: typeof OAuthSignInComplete.Type) {
            let privateGrant: OAuthConnectedGrantResponse | undefined;
            let grantStartedAt: number | undefined;
            let reservation: OAuthSignInAccessClaim | undefined;

            yield* Effect.addFinalizer(() =>
              Effect.sync(() => {
                if (privateGrant !== undefined) wipeConnectedMaterial(privateGrant.material);
              }),
            );
            yield* noAmbient();
            const request = yield* snapshotOAuth(OAuthSignInComplete, raw);
            const response = request.response;

            const serialized = yield* Schema.encodeEffect(responseJson)(response).pipe(
              Effect.mapError(() => OAuthRejected.make({})),
            );

            if (encoder.encode(serialized).length > 16384) return yield* OAuthRejected.make({});

            const binder = Object.freeze({
              ...(yield* verifyBinding(request.flowId, request.requestBinding).pipe(
                Effect.mapError(binderError),
              )),
            });

            const state = yield* stateDigest(request.flowId, request.provider, response.state);

            const random = yield* randomBytes(32).pipe(
              Effect.mapError(() => OAuthUnavailable.make({})),
            );

            const claimId = OAuthClaimId.make(Base64Url.encode(random));

            random.fill(0);

            const input = Object.freeze({
              moduleId: id,
              generation: policy.generation,
              flowId: request.flowId,
              provider: request.provider,
              callbackId: request.callbackId,
              stateDigest: state,
              requestBindingVerifier: binder.verifier,
              requestBindingExpiresAtMillis: binder.expiresAtMillis,
              claimId,
              ...(response.issuer === undefined ? {} : { responseIssuer: response.issuer }),
              nowMillis: DateTime.toEpochMillis(yield* DateTime.now),
            });

            const settled = yield* Effect.uninterruptibleMask((restore) =>
              Effect.gen(function* () {
                const receipt = yield* restore(
                  claim(input, (decision, journal) =>
                    journal.prepare(snapshotOAuthSync(OAuthClaimDecision, decision)),
                  ),
                );

                const decision = yield* read(receipt);

                if (decision._tag !== "Claimed") return yield* OAuthRejected.make({});
                const owned = snapshotOAuthSync(OAuthClaim, decision.claim);
                const context = owned.flow.context;

                if (
                  owned.claimId !== claimId ||
                  context.moduleId !== id ||
                  context.generation !== policy.generation ||
                  context.flowId !== request.flowId ||
                  context.provider !== request.provider ||
                  context.callbackId !== request.callbackId ||
                  context.stateDigest !== state ||
                  context.requestBindingVerifier !== binder.verifier ||
                  context.requestBindingExpiresAtMillis !== binder.expiresAtMillis ||
                  owned.claimedAtMillis < context.issuedAtMillis ||
                  owned.claimedAtMillis >= context.expiresAtMillis ||
                  context.expiresAtMillis > context.requestBindingExpiresAtMillis ||
                  owned.claimExpiresAtMillis !==
                    owned.claimedAtMillis + context.claimLifetimeMillis ||
                  owned.flow.retentionUntilMillis < owned.claimExpiresAtMillis ||
                  (context.responseIssuerMode === "required"
                    ? response.issuer !== context.issuer
                    : response.issuer !== undefined)
                )
                  return yield* OAuthUnavailable.make({});
                let verifiedAt = owned.claimedAtMillis;

                const exchange = Effect.gen(function* () {
                  const secrets = yield* open({
                    context: snapshotOAuthSync(OAuthSignInTransactionContext, context),
                    sealed: snapshotOAuthSync(OAuthSealedTransaction, owned.flow.sealed),
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

                  verifiedAt = DateTime.toEpochMillis(start);
                  if (verifiedAt >= owned.claimExpiresAtMillis)
                    return yield* OAuthUnavailable.make({});

                  const exchangeInput = {
                    configuration: snapshotOAuthSync(OAuthProtocolConfiguration, context),
                    response: snapshotOAuthSync(OAuthCallbackResponse, response) as typeof response,
                    secrets: snapshotOAuthSync(OAuthTransactionSecrets, secrets),
                    verificationStartedAt: start,
                  };

                  let identity: OAuthVerifiedExternalIdentity;

                  if (access === undefined) {
                    if (context.access !== undefined) return yield* OAuthRejected.make({});
                    identity = yield* exchangeVerifiedIdentity(exchangeInput).pipe(
                      Effect.flatMap((value) =>
                        snapshotOAuth(OAuthVerifiedExternalIdentity, value),
                      ),
                    );
                  } else {
                    reservation = yield* access.claim(owned);
                    grantStartedAt = DateTime.toEpochMillis(start);
                    const exchanged = yield* access.exchange(reservation, exchangeInput);

                    privateGrant = exchanged.grant;
                    identity = exchanged.identity;
                  }

                  if (
                    identity.identity.provider !== context.provider ||
                    identity.identity.issuer !== context.issuer
                  )
                    return yield* OAuthProtocolRejected.make({});
                  if (identity.upstreamAuthenticatedAt !== undefined)
                    verifiedAt = Math.min(
                      verifiedAt,
                      DateTime.toEpochMillis(identity.upstreamAuthenticatedAt),
                    );

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

                const definiteRejection =
                  exchanged !== undefined &&
                  Exit.isFailure(exchanged) &&
                  exchanged.cause.reasons.length === 1 &&
                  exchanged.cause.reasons[0]?._tag === "Fail" &&
                  Schema.is(OAuthProtocolRejected)(exchanged.cause.reasons[0].error);

                if (exchanged !== undefined && Exit.isFailure(exchanged) && !definiteRejection)
                  yield* reportAuthFailure("oauth-exchange", exchanged.cause);

                let outcome =
                  exchanged === undefined
                    ? { _tag: "Cancelled" as const }
                    : Exit.isSuccess(exchanged)
                      ? { _tag: "Verified" as const, identity: exchanged.value }
                      : definiteRejection
                        ? { _tag: "Rejected" as const }
                        : { _tag: "Ambiguous" as const };

                let registrationPrepared: Effect.Success<
                  ReturnType<typeof registrationSecrets.prepare>
                >;

                if (outcome._tag === "Verified" && registration !== undefined) {
                  const prepared = yield* Effect.exit(
                    bounded(
                      registrationSecrets.prepare(
                        owned,
                        outcome.identity,
                        verifiedAt,
                        registration.policy,
                      ),
                      remaining,
                    ),
                  );

                  if (Exit.isSuccess(prepared)) registrationPrepared = prepared.value;
                  else {
                    yield* reportAuthFailure("oauth-sign-in", prepared.cause);
                    outcome = { _tag: "Ambiguous" };
                  }
                }
                const intentCodec = Schema.fromJsonString(OAuthRegistrationIntent);

                const expectedIntent =
                  registrationPrepared === undefined
                    ? undefined
                    : Schema.encodeSync(intentCodec)(registrationPrepared.intent);

                const prepare: PrepareOAuthCommit<
                  OAuthRegistrationSettlement,
                  OAuthRegistrationSettlement
                > = (value, journal) => {
                  const result = snapshotOAuthSync(OAuthRegistrationSettlement, value);

                  if (result._tag === "RegistrationIssued") {
                    if (
                      outcome._tag !== "Verified" ||
                      expectedIntent === undefined ||
                      Schema.encodeSync(intentCodec)(result.intent) !== expectedIntent
                    )
                      throw OAuthUnavailable.make({});
                  } else if (result._tag !== "Rejected" && result._tag !== outcome._tag)
                    throw OAuthUnavailable.make({});

                  return journal.prepare(result);
                };

                const nowMillis = DateTime.toEpochMillis(yield* DateTime.now);

                const commit =
                  outcome._tag === "Verified" && registration !== undefined
                    ? registration.settle(
                        {
                          claim: snapshotOAuthSync(OAuthClaim, owned),
                          identity: snapshotOAuthSync(
                            OAuthVerifiedExternalIdentity,
                            outcome.identity,
                          ),
                          ...(registrationPrepared === undefined
                            ? {}
                            : {
                                intent: snapshotOAuthSync(
                                  OAuthRegistrationIntent,
                                  registrationPrepared.intent,
                                ),
                              }),
                          nowMillis,
                        },
                        prepare,
                      )
                    : settle(
                        { claim: snapshotOAuthSync(OAuthClaim, owned), outcome, nowMillis },
                        prepare,
                      );

                const finished = yield* bounded(commit, policy.settlementTimeoutMillis).pipe(
                  Effect.flatMap(read),
                  Effect.mapError(() => OAuthUnavailable.make({})),
                );

                if (
                  exchanged !== undefined &&
                  Exit.isFailure(exchanged) &&
                  Cause.hasInterrupts(exchanged.cause)
                )
                  return yield* Effect.interrupt;

                return {
                  finished,
                  ambiguous: outcome._tag === "Ambiguous",
                  // A protocol rejection before any grant is definite no-issuance.
                  // Identity mismatch after exchange still keeps the reservation open.
                  unissued:
                    reservation !== undefined && privateGrant === undefined && definiteRejection,
                  registrationCommand: registrationPrepared?.command,
                  context,
                  verifiedAt,
                  identity: outcome._tag === "Verified" ? outcome.identity : undefined,
                };
              }),
            );

            const { finished, context, verifiedAt, identity, registrationCommand, unissued } =
              settled;

            if (access !== undefined && reservation !== undefined && finished._tag !== "Verified") {
              yield* access.abandon(
                reservation,
                finished._tag === "Cancelled"
                  ? "Cancelled"
                  : finished._tag === "Ambiguous" || settled.ambiguous
                    ? "Ambiguous"
                    : unissued
                      ? "Unissued"
                      : "Rejected",
              );
            }

            if (finished._tag === "RegistrationIssued") {
              if (registrationCommand === undefined) return yield* OAuthUnavailable.make({});

              return {
                value: {
                  _tag: "RegistrationRequired" as const,
                  reference: finished.intent.reference,
                  expiresAtMillis: finished.intent.expiresAtMillis,
                  returnTarget: context.returnTarget,
                },
                credentialCommands: [registrationCommand],
              };
            }

            if (finished._tag === "Cancelled")
              return {
                value: { _tag: "Cancelled" as const, returnTarget: context.returnTarget },
                credentialCommands: [{ _tag: "Clear" as const, slot: "request-binding" as const }],
              };
            if (finished._tag === "Ambiguous" || settled.ambiguous)
              return yield* OAuthUnavailable.make({});
            if (finished._tag !== "Verified" || identity === undefined)
              return yield* OAuthRejected.make({});
            const credential = snapshotOAuthSync(OAuthCredentialSnapshot, finished.credential);

            if (
              credential.moduleId !== id ||
              credential.identity.provider !== identity.identity.provider ||
              credential.identity.issuer !== identity.identity.issuer ||
              credential.identity.subject !== identity.identity.subject ||
              new Set(credential.revision.credentials.map((item) => item.credentialId)).size !==
                credential.revision.credentials.length ||
              !credential.revision.credentials.some(
                (item) =>
                  item.credentialId === credential.credentialId &&
                  item.revision === credential.credentialRevision,
              )
            )
              return yield* OAuthUnavailable.make({});

            const connection =
              access === undefined
                ? undefined
                : yield* Effect.gen(function* () {
                    if (
                      reservation === undefined ||
                      privateGrant === undefined ||
                      grantStartedAt === undefined
                    )
                      return yield* OAuthUnavailable.make({});

                    return yield* bounded(
                      access.retain(reservation, credential, privateGrant, grantStartedAt),
                      policy.settlementTimeoutMillis,
                    ).pipe(
                      Effect.catchTag("TimeoutError", () => Effect.fail(OAuthUnavailable.make({}))),
                    );
                  });

            const bindingDigest = yield* hash(
              yield* Schema.encodeEffect(contextJson)(context).pipe(
                Effect.mapError(() => OAuthUnavailable.make({})),
              ),
            );

            const claims = yield* resolveClaims({
              subjectId: credential.revision.subjectId,
              credential: snapshotOAuthSync(OAuthCredentialSnapshot, credential),
              identity: snapshotOAuthSync(OAuthVerifiedExternalIdentity, identity),
            });

            const established = yield* completeAuthentication({
              claims,
              evidence: {
                revision: credential.revision,
                flowId: AuthenticationFlowId.make(context.flowId),
                bindingDigest,
                proofs: [
                  {
                    method: context.protocol,
                    credentialId: credential.credentialId,
                    factors: ["possession"],
                    userVerified: false,
                    phishingResistant: false,
                    verifiedAt: DateTime.makeUnsafe(verifiedAt),
                  },
                ],
              },
            }).pipe(
              Effect.mapError((error) =>
                error._tag === "HookDenied"
                  ? error
                  : error._tag === "SessionUnavailable"
                    ? OAuthUnavailable.make({})
                    : OAuthRejected.make({}),
              ),
              Effect.flatMap(read),
            );

            return {
              value: {
                completion: established.value,
                returnTarget: context.returnTarget,
                ...(connection === undefined ? {} : { connection }),
              },
              credentialCommands: [
                ...established.credentialCommands,
                { _tag: "Clear" as const, slot: "request-binding" as const },
              ],
            };
          },
          Effect.scoped,
          Effect.provideService(Crypto.Crypto, crypto),
          Effect.tapCause((cause) =>
            Cause.hasDies(cause) ? reportAuthFailure("oauth-sign-in", cause) : Effect.void,
          ),
          Effect.catchDefect(() => Effect.fail(OAuthUnavailable.make({}))),
        );

        return SignIn.of({ begin, complete });
      }),
    );
  };

  const signInLayer = (configuration: OAuthSignInPolicy) =>
    makeSignInLayer(configuration, Effect.succeed(undefined));

  const registration = <Registration extends Schema.Codec<unknown, unknown, unknown, unknown>>(
    codec: Registration,
  ) => {
    const capability = makeOAuthRegistration(moduleId, codec, binding);

    const registrationSignInLayer = (
      configuration: OAuthSignInPolicy,
      registrationConfiguration: OAuthRegistrationPolicy,
    ) => {
      let captured: OAuthRegistrationPolicy | undefined;

      try {
        captured = snapshotOAuthSync(OAuthRegistrationPolicy, registrationConfiguration);
      } catch {
        /* Layer reports invalid policy. */
      }

      return makeSignInLayer(
        configuration,
        Effect.gen(function* () {
          if (captured === undefined)
            return yield* OAuthConfigurationError.make({ reason: "policy" });
          const { settle } = yield* OAuthRegistrationIntents;

          return { settle, policy: captured };
        }),
      );
    };

    return Object.freeze({
      ...capability,
      signInLayer: registrationSignInLayer,
      strategy: makeAuthStrategy(
        { register: capability.operations.Complete.invoke },
        capability.handlersLayer.pipe(
          Layer.provide(defaultLayer(capability.Registrations, capability.layer)),
          Layer.provide(defaultLayer(binding.RequestBinding, binding.layer)),
          Layer.provide([cryptoLayer, hooksLayer]),
        ),
      ),
    });
  };

  const Begin = makeOperation(`${moduleId}/sign-in/begin`, {
    payload: OAuthSignInBegin,
    success: OAuthSignInAuthorization,
    error: Failure,
    access: "any",
    exposure: "public",
    replay: "non-idempotent",
    credentials: true,
  });

  const Complete = makeOperation(`${moduleId}/sign-in/complete`, {
    payload: OAuthSignInComplete,
    success: CompletionResult,
    error: Failure,
    access: "any",
    exposure: "public",
    replay: "single-use",
    credentials: true,
  });

  /** Allocate once per execution, outside codecs and transport retries. The
   * underlying Begin operation keeps the explicit IDs used by persistence. */
  const signIn = Effect.fn("OAuth.signInRequest")(function* (
    invocation: AuthInvocation,
    raw: typeof OAuthSignInInput.Encoded,
  ) {
    const input = yield* Schema.decodeEffect(OAuthSignInInput)(raw).pipe(
      Effect.mapError(() => InvalidOperationInput.make({})),
    );

    const crypto = yield* Crypto.Crypto;

    const flowId = yield* crypto.randomUUIDv4.pipe(
      Effect.mapError(() => OAuthUnavailable.make({})),
    );

    const commandId = yield* crypto.randomUUIDv4.pipe(
      Effect.mapError(() => OAuthUnavailable.make({})),
    );

    return yield* Begin.invoke(invocation, { ...input, flowId, commandId });
  });

  const handlersLayer = Layer.mergeAll(
    Begin.credentialHandlerLayer(
      Effect.fn("OAuth.Begin")(function* (input) {
        return yield* (yield* SignIn).begin(input);
      }),
    ),
    Complete.credentialHandlerLayer(
      Effect.fn("OAuth.Complete")(function* (input) {
        return yield* (yield* SignIn).complete(input);
      }),
    ),
  );

  const layer = (policy: OAuthSignInPolicy) =>
    handlersLayer.pipe(
      Layer.provide(defaultLayer(SignIn, signInLayer(policy))),
      Layer.provide(defaultLayer(binding.RequestBinding, binding.layer)),
      Layer.provide([cryptoLayer, hooksLayer]),
    );

  const accounts = (policy: OAuthAccountsPolicy) => {
    const module = makeOAuthAccounts(moduleId, sessions, policy);

    return Object.freeze({
      ...module,
      strategy: makeAuthStrategy(
        {
          linkAccount: module.operations.Link.Begin.invoke,
          completeAccountLink: module.operations.Link.Complete.invoke,
          unlinkAccount: module.operations.Unlink.invoke,
        },
        module.handlersLayer.pipe(
          Layer.provide(defaultLayer(module.Accounts, module.layer)),
          Layer.provide(defaultLayer(module.binding.RequestBinding, module.binding.layer)),
          Layer.provide([cryptoLayer, hooksLayer]),
        ),
      ),
    });
  };

  const connected = (policy: OAuthConnectedPolicy) => {
    const module = makeOAuthConnected(moduleId, policy);

    return Object.freeze({
      ...module,
      strategy: makeAuthStrategy(
        {
          connectAccount: module.operations.Begin.invoke,
          completeAccountConnection: module.operations.Complete.invoke,
          listAccountConnections: module.operations.List.invoke,
          disconnectAccount: module.operations.Disconnect.invoke,
        },
        module.handlersLayer.pipe(
          Layer.provide(defaultLayer(module.Connected, module.layer)),
          Layer.provide(defaultLayer(module.binding.RequestBinding, module.binding.layer)),
          Layer.provide([cryptoLayer, hooksLayer]),
        ),
      ),
    });
  };

  return Object.freeze({
    binding,
    SessionClaims,
    SignIn,
    signInLayer,
    layer,
    registration,
    accounts,
    connected,
    CompletionResult,
    signIn,
    operations: Object.freeze({ Begin, Complete }),
    handlersLayer,
    group: operationGroup(Begin, Complete),
  });
};
