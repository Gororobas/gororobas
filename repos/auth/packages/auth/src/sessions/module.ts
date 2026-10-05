import {
  Array as EffectArray,
  Cause,
  Context,
  Crypto,
  DateTime,
  Effect,
  Layer,
  Option,
  Redacted,
  Result,
  Schema,
  type Scope,
  type Types,
} from "effect";
import { Base64Url } from "effect/encoding";

import { cryptoLayer, hooksLayer } from "../auth/defaults";
import { type PreparedCommit, hasCommitScope, coordinateCommit } from "../hooks/commit";
import { LifecycleHooks } from "../hooks/LifecycleHooks";
import type { HookDenied } from "../hooks/models";
import { LifecycleEventId, lifecycleEvent, lifecycleSnapshot } from "../hooks/models";
import { reportAuthFailure } from "../internal/diagnostics";
import {
  AuthenticationAssurance,
  type AssuranceRequirement,
  requireAssurance,
  requireAuthenticated,
} from "../operations/context";
import { type AuthOperationResult } from "../operations/credentials";
import { TokenDigest } from "../Schema";
import {
  assessAuthentication,
  combineAuthenticationEvidence,
  snapshotAuthenticationEvidence,
  snapshotSessionAuthenticationProvenance,
} from "./assurance";
import { AuthenticationAuthority } from "./AuthenticationAuthority";
import { makeSessionContract } from "./contract";
import { makeSessionSecrets, makeSessionSigningCodec, type SessionSigningKeyring } from "./crypto";
import type { SessionError } from "./errors";
import {
  SessionCapabilityUnsupported,
  SessionConfigurationError,
  SessionInvalid,
  SessionSignOutUnavailable,
  SessionUnavailable,
  SessionRenewalTooEarly,
  SessionStepUpInvalid,
} from "./errors";
import { sessionInvalidationWindow } from "./invalidation";
import {
  type AuthenticationEvidence,
  type PendingConsumption,
  type SessionMetadata,
  AuthenticationFlowId,
  AuthenticationRequirement,
  SessionId,
  SessionAuthenticationProvenance,
  SessionCredentialVersion,
  type SessionCapabilities,
  type SessionInspection,
} from "./models";
import {
  type PendingAuthentication as PendingPort,
  type PendingAuthenticationContext,
  snapshotPendingAuthenticationContext,
} from "./PendingAuthentication";
import type {
  SessionRepository as RepositoryPort,
  SignedSessionValidity as ValidityPort,
  StatefulSessionPersistence as PersistencePort,
} from "./persistence";
import {
  type SessionPolicy,
  stateAssistedCapabilities,
  statefulCapabilities,
  statelessCapabilities,
  validateSessionPolicy,
  validateSessionTimeline,
} from "./policy";
import {
  type SessionStepUpProfileId,
  SessionStepUpIntent,
  SessionStepUpProfile,
  SessionStepUpRequirement,
  type StepUpPending,
  type SessionStepUpCompletionPlan,
  type SessionStepUpPersistence as StepUpPort,
  type SessionStepUpReplacement,
  type SessionStepUpSource,
} from "./SessionStepUpPersistence";

export interface ModuleService<Id extends string, Kind extends string, Claims> {
  readonly moduleId: Id;
  readonly kind: Kind;
  readonly claims: Types.Invariant<Claims>;
}

const reportSignOutFailure = <A, E extends { readonly _tag: string }, R>(
  effect: Effect.Effect<A, E, R>,
) =>
  effect.pipe(
    Effect.tapCause((cause) =>
      reportAuthFailure(
        "session-sign-out",
        Cause.fromReasons(
          cause.reasons.filter(
            (reason) =>
              Cause.isFailReason(reason) &&
              reason.error._tag !== "SessionInvalid" &&
              reason.error._tag !== "HookDenied",
          ),
        ),
      ),
    ),
  );

/** Stable module IDs isolate service keys and signed/digested credential namespaces. */
export type CompletionLayer<
  Id extends string,
  Claims extends Schema.Codec<unknown, unknown, unknown, unknown>,
  R = never,
> = Layer.Layer<
  ModuleService<Id, "completion", Claims["Type"]>,
  SessionConfigurationError,
  | ModuleService<Id, "strategy", Claims["Type"]>
  | Crypto.Crypto
  | AuthenticationAuthority
  | Exclude<Claims["DecodingServices"], Scope.Scope>
  | Exclude<Claims["EncodingServices"], Scope.Scope>
  | Exclude<R, Scope.Scope>
>;

export const makeSessionModule = <
  const Id extends string,
  Claims extends Schema.Codec<unknown, unknown, unknown, unknown>,
>(
  moduleId: Id,
  claims: Claims,
) => {
  const { Session, CompletionResult, operations, group, stepUpOperations, stepUpGroup } =
    makeSessionContract(moduleId, claims);

  const ClaimsCodec: Schema.Codec<
    Claims["Type"],
    Claims["Encoded"],
    Claims["DecodingServices"],
    Claims["EncodingServices"]
  > = Session.fields.claims;

  type Session = typeof Session.Type;
  type CompletionResult = typeof CompletionResult.Type;
  type SignOutResult = typeof operations.SignOut.rpc.successSchema.Type;
  type Failure = SessionError | HookDenied;
  type Prepared<A, R = never> = Effect.Effect<PreparedCommit<AuthOperationResult<A>>, Failure, R>;
  type Issuance = {
    readonly evidence: AuthenticationEvidence;
    readonly claims: Claims["Type"];
    readonly pending?: PendingConsumption;
  };
  type Inspection = SessionInspection<Claims["Type"]>;
  type Strategy = {
    readonly policy: SessionPolicy;
    readonly capabilities: SessionCapabilities;
    /** @effect-expect-leaking AuthenticationAuthority -- fresh issuance alone needs identity authority; verification does not. */
    readonly prepareEstablish: (input: Issuance) => Prepared<Session, AuthenticationAuthority>;
    /**
     * Trusted browser-login completion, never a public caller's session assertion.
     * The caller must persist an inspected source and confirm terminal consumption
     * of its bound handoff before calling once outside any commit scope; unknown
     * outcomes never authorize issuance.
     * Preserve source assurance and proof revisions/times, using a fresh flow/binding.
     * Initial expiry is capped by the source; after issuance the sessions renew and
     * revoke independently, subject to their shared subject/credential authority.
     * @effect-expect-leaking AuthenticationAuthority -- handoff issuance rechecks current authority.
     */
    readonly prepareHandoff: (input: {
      readonly source: Inspection;
      readonly flowId: AuthenticationFlowId;
      readonly bindingDigest: TokenDigest;
    }) => Prepared<Session, AuthenticationAuthority>;
    /** Trusted method-only authentication source. Never expose through a public RPC. */
    readonly inspectForStepUp: (
      credential: Redacted.Redacted<string>,
    ) => Effect.Effect<SessionStepUpSource<Claims["Type"]>, Failure>;
    readonly inspect: (credential: Redacted.Redacted<string>) => Effect.Effect<Inspection, Failure>;
    readonly verify: (credential: Redacted.Redacted<string>) => Effect.Effect<Session, Failure>;
    readonly prepareRenew: (credential: Redacted.Redacted<string>) => Prepared<Session>;
    readonly signOut: (
      credential: Redacted.Redacted<string>,
    ) => Effect.Effect<AuthOperationResult<SignOutResult>, Failure>;
    readonly list: (
      input: Parameters<RepositoryPort["list"]>[0],
    ) => Effect.Effect<Effect.Success<ReturnType<RepositoryPort["list"]>>, Failure>;
    readonly revoke: (session: Session, sessionId: SessionId) => Effect.Effect<void, Failure>;
    readonly revokeAll: (session: Session) => Effect.Effect<void, Failure>;
  };

  const SessionStrategy = Context.Service<ModuleService<Id, "strategy", Claims["Type"]>, Strategy>(
    `effect-auth/sessions/${moduleId}/Strategy`,
  );

  // This tag is deliberately not returned by the module: no public precommit signer.
  const StepUpPlanner = Context.Service<
    ModuleService<Id, "step-up-planner", Claims["Type"]>,
    {
      readonly plan: (
        source: SessionStepUpSource<Claims["Type"]>,
        evidence: AuthenticationEvidence,
        assurance: AuthenticationAssurance,
      ) => Effect.Effect<
        {
          readonly replacement: SessionStepUpReplacement<Claims["Type"]>;
          readonly credential: Redacted.Redacted<string>;
        },
        Failure
      >;
    }
  >(`effect-auth/sessions/${moduleId}/StepUpPlanner`);

  const SessionStepUpPersistence = Context.Service<
    ModuleService<Id, "step-up-persistence", Claims["Type"]>,
    StepUpPort<Claims["Type"]>
  >(`effect-auth/sessions/${moduleId}/StepUpPersistence`);

  const StatefulSessionPersistence = Context.Service<
    ModuleService<Id, "persistence", Claims["Type"]>,
    PersistencePort<Claims["Type"]>
  >(`effect-auth/sessions/${moduleId}/Persistence`);

  const SessionRepository = Context.Service<
    ModuleService<Id, "repository", Claims["Type"]>,
    RepositoryPort
  >(`effect-auth/sessions/${moduleId}/Repository`);

  const SignedSessionValidity = Context.Service<
    ModuleService<Id, "validity", Claims["Type"]>,
    ValidityPort
  >(`effect-auth/sessions/${moduleId}/Validity`);

  const PendingAuthentication = Context.Service<
    ModuleService<Id, "pending", Claims["Type"]>,
    PendingPort<Claims["Type"]>
  >(`effect-auth/sessions/${moduleId}/Pending`);

  const unsupported = (capability: string) =>
    Effect.fail(SessionCapabilityUnsupported.make({ capability }));

  const checkNoAmbientCommit = Effect.fn("Session.checkNoAmbientCommit")(function* () {
    if (yield* hasCommitScope)
      return yield* SessionCapabilityUnsupported.make({
        capability: "public-operation-inside-transaction; use prepared completion",
      });
  });

  const checkRenewalDue = (session: SessionMetadata, now: DateTime.Utc, policy: SessionPolicy) => {
    const retryAt = DateTime.add(session.issuedAt, { milliseconds: policy.renewalIntervalMillis });

    return DateTime.toEpochMillis(now) < DateTime.toEpochMillis(retryAt)
      ? Effect.fail(SessionRenewalTooEarly.make({ retryAt }))
      : Effect.void;
  };

  const readCommitted = <A>(receipt: PreparedCommit<A>) =>
    receipt.read.pipe(Effect.mapError(() => SessionUnavailable.make({})));

  const prepareHooks = Effect.fn("Session.prepareHooks")(function* (
    action: "sign-in" | "session-creation" | "sign-out",
    session?: Pick<SessionMetadata, "subjectId" | "assurance">,
  ) {
    const hooks = yield* LifecycleHooks;
    const secrets = yield* makeSessionSecrets(moduleId);

    const snapshot = lifecycleSnapshot({
      action,
      operation: `${moduleId}/session`,
      ...(session === undefined
        ? {}
        : { subjectId: session.subjectId, method: session.assurance.method }),
      identifiers: [],
    });

    yield* hooks.before(snapshot);
    const id = yield* secrets.generate();

    return lifecycleEvent({
      id: LifecycleEventId.make(Redacted.value(id)),
      occurredAtMillis: DateTime.toEpochMillis(yield* DateTime.now),
      snapshot,
    });
  });

  // Detach mutable date/collection declarations as well as projecting declared fields.
  // Work from the Type view so consumer wire transformations are not replayed.
  const publicSessionCodec = Schema.toCodecJson(Schema.toType(Session));

  const projectSession = (session: Session) =>
    Schema.encodeEffect(publicSessionCodec)(session).pipe(
      Effect.flatMap(Schema.decodeEffect(publicSessionCodec)),
      Effect.mapError(() => SessionInvalid.make({})),
    );

  const issue = (
    session: Session,
    credential: Redacted.Redacted<string>,
  ): AuthOperationResult<Session> => ({
    value: Schema.decodeSync(publicSessionCodec)(Schema.encodeSync(publicSessionCodec)(session)),
    credentialCommands: [
      {
        _tag: "Issue",
        slot: "session",
        credential,
        expiresAtMillis: DateTime.toEpochMillis(session.expiresAt),
      },
    ],
  });

  const inspectProvenance = Effect.fn("Session.inspectProvenance")(function* (
    session: Session,
    input: SessionAuthenticationProvenance,
    version: SessionCredentialVersion,
  ) {
    const provenance = yield* snapshotSessionAuthenticationProvenance(input).pipe(
      Effect.mapError(() => SessionInvalid.make({})),
    );

    const credentialVersion = yield* Schema.decodeEffect(SessionCredentialVersion)(version).pipe(
      Effect.mapError(() => SessionInvalid.make({})),
    );

    const original = provenance.evidence;
    const publicProofs = session.assurance.evidence;
    const ordinals = new Map<string, number>();
    const revisions = new Set(original.revision.credentials.map((item) => item.credentialId));

    if (
      revisions.size !== original.revision.credentials.length ||
      original.proofs.some((proof) => !revisions.has(proof.credentialId))
    )
      return yield* SessionInvalid.make({});
    for (const proof of original.proofs)
      if (!ordinals.has(proof.credentialId)) ordinals.set(proof.credentialId, ordinals.size);
    if (
      session.subjectId !== original.revision.subjectId ||
      session.securityRevision !== original.revision.securityRevision ||
      publicProofs === undefined ||
      publicProofs.length !== original.proofs.length ||
      original.proofs.some((proof, index) => {
        const actual = publicProofs[index];

        return (
          actual.method !== proof.method ||
          actual.credentialOrdinal !== ordinals.get(proof.credentialId) ||
          actual.userVerified !== proof.userVerified ||
          actual.phishingResistant !== proof.phishingResistant ||
          DateTime.toEpochMillis(actual.verifiedAt) !== DateTime.toEpochMillis(proof.verifiedAt) ||
          actual.factors.length !== proof.factors.length ||
          actual.factors.some((factor, i) => factor !== proof.factors[i])
        );
      })
    )
      return yield* SessionInvalid.make({});

    return Object.freeze({ session, provenance, credentialVersion });
  });

  const prepareHandoffIssuance = Effect.fn("Session.prepareHandoffIssuance")(function* (
    input: Parameters<Strategy["prepareHandoff"]>[0],
  ) {
    yield* checkNoAmbientCommit();

    const detached = yield* snapshotInspection(input.source).pipe(
      Effect.mapError(() => SessionInvalid.make({})),
    );

    const source = yield* inspectProvenance(
      detached.session,
      detached.provenance,
      detached.credentialVersion,
    );

    const original = source.provenance.evidence;

    if (input.flowId === original.flowId || input.bindingDigest === original.bindingDigest)
      return yield* SessionInvalid.make({});

    return {
      issuance: {
        evidence: {
          ...original,
          flowId: input.flowId,
          bindingDigest: input.bindingDigest,
        },
        claims: source.session.claims,
      },
      source: source.session,
    };
  });

  const prepareIssuance = Effect.fn("Session.prepareIssuance")(function* (
    input: Issuance,
    policy: SessionPolicy,
    source?: Session,
  ) {
    const evidence = yield* snapshotAuthenticationEvidence(input.evidence);
    const authority = yield* AuthenticationAuthority;
    const requirement = yield* authority.requirements(evidence);

    const assessed = yield* assessAuthentication(evidence, requirement).pipe(
      Effect.mapError(() => SessionInvalid.make({})),
    );

    if (!assessed.satisfied) return yield* SessionInvalid.make({});

    // Current policy assesses the original proofs; it does not rewrite their
    // historical assurance or advance authenticatedAt when an older proof ages out.
    const assurance =
      source === undefined ? assessed.assurance : AuthenticationAssurance.make(source.assurance);

    const now = yield* DateTime.now;

    const absoluteExpiresAt = DateTime.makeUnsafe(
      Math.min(
        DateTime.toEpochMillis(assurance.authenticatedAt) + policy.absoluteLifetimeMillis,
        source === undefined ? Infinity : DateTime.toEpochMillis(source.absoluteExpiresAt),
      ),
    );

    const session = {
      subjectId: evidence.revision.subjectId,
      securityRevision: evidence.revision.securityRevision,
      assurance,
      issuedAt: now,
      expiresAt: DateTime.makeUnsafe(
        Math.min(
          DateTime.toEpochMillis(absoluteExpiresAt),
          DateTime.toEpochMillis(now) + policy.idleLifetimeMillis,
          // The existing commit-time expiry guard also checks source liveness.
          source === undefined ? Infinity : DateTime.toEpochMillis(source.expiresAt),
        ),
      ),
      absoluteExpiresAt,
      claims: input.claims,
    };

    yield* validateSessionTimeline(session, policy);

    return { evidence, session };
  });

  const replacementSession = Effect.fn("Session.replacementSession")(function* (
    source: Session,
    evidence: AuthenticationEvidence,
    assurance: AuthenticationAssurance,
    policy: SessionPolicy,
    sessionId: SessionId,
  ) {
    const now = yield* DateTime.now;

    const session = yield* projectSession({
      ...source,
      sessionId,
      subjectId: evidence.revision.subjectId,
      securityRevision: evidence.revision.securityRevision,
      assurance: AuthenticationAssurance.make({
        ...assurance,
        authenticatedAt: source.assurance.authenticatedAt,
      }),
      issuedAt: now,
      expiresAt: DateTime.makeUnsafe(
        Math.min(
          DateTime.toEpochMillis(source.absoluteExpiresAt),
          DateTime.toEpochMillis(now) + policy.idleLifetimeMillis,
        ),
      ),
    });

    yield* validateSessionTimeline(source, policy);
    yield* validateSessionTimeline(session, policy);

    return session;
  });

  const statefulLayer = (configured: SessionPolicy) =>
    Layer.effectContext(
      Effect.gen(function* () {
        const policy = yield* validateSessionPolicy(configured, statefulCapabilities);
        const store = yield* StatefulSessionPersistence;
        const repository = yield* SessionRepository;
        const secrets = yield* makeSessionSecrets(moduleId);

        const services = yield* Effect.context<
          Claims["EncodingServices"] | Claims["DecodingServices"] | LifecycleHooks | Crypto.Crypto
        >();

        const validate = (session: Session) =>
          projectSession(session).pipe(
            Effect.provide(services),
            Effect.flatMap((value) =>
              validateSessionTimeline(value, policy).pipe(Effect.as(value)),
            ),
          );

        const inspectForStepUp = Effect.fn("StatefulSession.inspectForStepUp")(function* (
          credential: Redacted.Redacted<string>,
        ) {
          const digest = yield* secrets.digest(credential, "bearer");
          const record = yield* store.verify({ digest, now: yield* DateTime.now });

          const inspection = yield* inspectProvenance(
            yield* validate(record),
            record.provenance,
            record.credentialVersion,
          );

          return Object.freeze({
            inspection,
            guard: Object.freeze({ _tag: "Stateful" as const, digest, rowVersion: record.version }),
          });
        });

        const inspect = Effect.fn("StatefulSession.inspect")(
          (credential: Redacted.Redacted<string>) =>
            inspectForStepUp(credential).pipe(Effect.map((source) => source.inspection)),
        );

        const verify = Effect.fn("StatefulSession.verify")(
          (credential: Redacted.Redacted<string>) =>
            inspect(credential).pipe(Effect.map((value) => value.session)),
        );

        const prepareEstablish = Effect.fn("StatefulSession.prepareEstablish")(function* (
          input: Issuance,
          source?: Session,
        ) {
          const planned = yield* prepareIssuance(input, policy, source);
          const credential = yield* secrets.generate();
          const digest = yield* secrets.digest(credential, "bearer");

          const base = {
            ...planned.session,
            digest,
            provenance: yield* snapshotSessionAuthenticationProvenance({
              evidence: planned.evidence,
            }),
            credentialVersion: SessionCredentialVersion.make(
              Redacted.value(yield* secrets.generate()),
            ),
          };

          yield* validateSessionTimeline(base, policy);
          const event = yield* prepareHooks("sign-in", base).pipe(Effect.provide(services));

          const creation = yield* prepareHooks("session-creation", base).pipe(
            Effect.provide(services),
          );

          yield* validateSessionTimeline(base, policy);
          const commitNow = yield* DateTime.now;

          return yield* store.establish(
            {
              session: base,
              evidence: planned.evidence,
              ...(source === undefined ? {} : { handoffSourceSessionId: source.sessionId }),
              ...(input.pending === undefined ? {} : { pending: input.pending }),
              now: commitNow,
            },
            (record, journal) => {
              journal.stage(event);
              journal.stage(creation);

              return journal.prepare(issue(record, credential));
            },
          );
        });

        const strategy = SessionStrategy.of({
          policy,
          capabilities: statefulCapabilities,
          inspectForStepUp,
          inspect,
          verify,
          prepareEstablish: (input) => prepareEstablish(input),
          prepareHandoff: Effect.fn("StatefulSession.prepareHandoff")(function* (input) {
            const handoff = yield* prepareHandoffIssuance(input);

            return yield* prepareEstablish(handoff.issuance, handoff.source);
          }),
          prepareRenew: Effect.fn("StatefulSession.prepareRenew")(function* (
            credential: Redacted.Redacted<string>,
          ) {
            const digest = yield* secrets.digest(credential, "bearer");
            const now = yield* DateTime.now;
            const record = yield* store.verify({ digest, now });

            const inspected = yield* inspectProvenance(
              yield* validate(record),
              record.provenance,
              record.credentialVersion,
            );

            const session = inspected.session;

            yield* checkRenewalDue(session, now, policy);
            const next = yield* secrets.generate();
            const nextDigest = yield* secrets.digest(next, "bearer");

            const nextCredentialVersion = SessionCredentialVersion.make(
              Redacted.value(yield* secrets.generate()),
            );

            const event = yield* prepareHooks("session-creation", session).pipe(
              Effect.provide(services),
            );

            yield* validateSessionTimeline(session, policy);
            const commitNow = yield* DateTime.now;

            const nextExpiresAt = DateTime.makeUnsafe(
              Math.min(
                DateTime.toEpochMillis(session.absoluteExpiresAt),
                DateTime.toEpochMillis(now) + policy.idleLifetimeMillis,
              ),
            );

            return yield* store.rotate(
              {
                sessionId: session.sessionId,
                expectedDigest: digest,
                expectedVersion: record.version,
                expectedSecurityRevision: session.securityRevision,
                nextDigest,
                nextCredentialVersion,
                nextExpiresAt,
                now: commitNow,
              },
              (rotated, journal) => {
                journal.stage(event);

                return journal.prepare(issue(rotated, next));
              },
            );
          }),
          signOut: Effect.fn("StatefulSession.signOut")(function* (
            credential: Redacted.Redacted<string>,
          ) {
            const result = yield* Effect.gen(function* () {
              const digest = yield* secrets.digest(credential, "bearer");
              const event = yield* prepareHooks("sign-out").pipe(Effect.provide(services));

              const receipt = yield* store.revokeDigest(digest, (revoked, journal) => {
                journal.stage(event);

                return journal.prepare({
                  clearCredential: true as const,
                  invalidation: revoked ? ("revoked" as const) : ("already-invalid" as const),
                });
              });

              return yield* readCommitted(receipt);
            }).pipe(reportSignOutFailure, Effect.result);

            return {
              value:
                result._tag === "Failure"
                  ? result.failure._tag === "SessionInvalid"
                    ? { clearCredential: true as const, invalidation: "already-invalid" as const }
                    : SessionSignOutUnavailable.make({ clearCredential: true })
                  : result.success,
              credentialCommands: [{ _tag: "Clear" as const, slot: "session" as const }],
            };
          }),
          list: repository.list,
          revoke: Effect.fn("StatefulSession.revoke")(function* (session, sessionId) {
            const event = yield* prepareHooks("sign-out", session).pipe(Effect.provide(services));

            return yield* readCommitted(
              yield* store.revoke(
                {
                  subjectId: session.subjectId,
                  sessionId,
                  expectedSecurityRevision: session.securityRevision,
                },
                (_, journal) => {
                  journal.stage(event);

                  return journal.prepare(undefined);
                },
              ),
            );
          }),
          revokeAll: Effect.fn("StatefulSession.revokeAll")(function* (session) {
            const event = yield* prepareHooks("sign-out", session).pipe(Effect.provide(services));

            return yield* readCommitted(
              yield* store.revokeAll(
                {
                  subjectId: session.subjectId,
                  expectedSecurityRevision: session.securityRevision,
                },
                (_, journal) => {
                  journal.stage(event);

                  return journal.prepare(undefined);
                },
              ),
            );
          }),
        });

        const plan = Effect.fn("StatefulSession.planStepUpReplacement")(function* (
          source: SessionStepUpSource<Claims["Type"]>,
          evidence: AuthenticationEvidence,
          assurance: AuthenticationAssurance,
        ) {
          if (source.guard._tag !== "Stateful") return yield* SessionStepUpInvalid.make({});
          const credential = yield* secrets.generate();
          const nextDigest = yield* secrets.digest(credential, "bearer");

          const session = yield* replacementSession(
            source.inspection.session,
            evidence,
            assurance,
            policy,
            source.inspection.session.sessionId,
          );

          const inspection = yield* inspectProvenance(
            session,
            { evidence },
            SessionCredentialVersion.make(Redacted.value(yield* secrets.generate())),
          );

          return {
            credential,
            replacement: Object.freeze({
              _tag: "Stateful" as const,
              inspection,
              expectedDigest: source.guard.digest,
              expectedRowVersion: source.guard.rowVersion,
              nextDigest,
            }),
          };
        });

        return Context.make(SessionStrategy, strategy).pipe(Context.add(StepUpPlanner, { plan }));
      }),
    );

  const signedLayer = <Mode extends "stateless" | "state-assisted">(
    configured: SessionPolicy,
    keyring: SessionSigningKeyring,
    mode: Mode,
  ) => {
    const layer = Layer.effectContext(
      Effect.gen(function* () {
        const validity =
          mode === "state-assisted"
            ? Option.some(yield* SignedSessionValidity)
            : Option.none<ValidityPort>();

        const capabilities = Option.isSome(validity)
          ? stateAssistedCapabilities
          : statelessCapabilities;

        const policy = yield* validateSessionPolicy(configured, capabilities);
        const hooks = yield* LifecycleHooks;
        const secrets = yield* makeSessionSecrets(moduleId);

        const services = yield* Effect.context<
          Claims["EncodingServices"] | Claims["DecodingServices"] | LifecycleHooks | Crypto.Crypto
        >();

        const Envelope = Schema.Struct({
          version: Schema.Literal(2),
          moduleId: Schema.Literal(moduleId),
          issuer: Schema.String,
          audience: Schema.String,
          generation: Schema.Natural,
          session: Session,
          provenance: SessionAuthenticationProvenance,
          credentialVersion: SessionCredentialVersion,
        });

        const signing = yield* makeSessionSigningCodec(Envelope, keyring, policy.maximumTokenBytes);

        const encode = (inspection: Inspection) =>
          signing.encode({
            version: 2,
            moduleId,
            issuer: policy.issuer,
            audience: policy.audience,
            generation: policy.generation,
            ...inspection,
          });

        const inspect = Effect.fn("SignedSession.inspect")(function* (
          credential: Redacted.Redacted<string>,
        ) {
          const envelope = yield* signing.decode(credential);

          if (
            envelope.issuer !== policy.issuer ||
            envelope.audience !== policy.audience ||
            envelope.generation !== policy.generation
          )
            return yield* SessionInvalid.make({});
          yield* validateSessionTimeline(envelope.session, policy);
          if (Option.isSome(validity))
            yield* validity.value.verify(envelope.session, yield* DateTime.now);

          return yield* inspectProvenance(
            yield* projectSession(envelope.session),
            envelope.provenance,
            envelope.credentialVersion,
          );
        });

        const inspectForStepUp = Effect.fn("SignedSession.inspectForStepUp")(function* (
          credential: Redacted.Redacted<string>,
        ) {
          return Object.freeze({
            inspection: yield* inspect(credential),
            guard: Object.freeze(
              Option.isSome(validity)
                ? { _tag: "StateAssistedSigned" as const }
                : { _tag: "StatelessSigned" as const },
            ),
          });
        });

        const verify = Effect.fn("SignedSession.verify")((credential: Redacted.Redacted<string>) =>
          inspect(credential).pipe(Effect.map((value) => value.session)),
        );

        const prepareEstablish = Effect.fn("SignedSession.prepareEstablish")(function* (
          input: Issuance,
          source?: Session,
        ) {
          const planned = yield* prepareIssuance(input, policy, source);
          const authority = yield* AuthenticationAuthority;

          const session: Session = {
            ...planned.session,
            sessionId: SessionId.make(Redacted.value(yield* secrets.generate())),
          };

          if (session.sessionId === source?.sessionId) return yield* SessionInvalid.make({});
          yield* validateSessionTimeline(session, policy);

          const provenance = yield* snapshotSessionAuthenticationProvenance({
            evidence: planned.evidence,
          });

          const credentialVersion = SessionCredentialVersion.make(
            Redacted.value(yield* secrets.generate()),
          );

          const credential = yield* encode({ session, provenance, credentialVersion });
          const event = yield* prepareHooks("sign-in", session).pipe(Effect.provide(services));

          const creation = yield* prepareHooks("session-creation", session).pipe(
            Effect.provide(services),
          );

          yield* validateSessionTimeline(session, policy);

          return yield* authority.approve(
            {
              evidence: planned.evidence,
              ...(input.pending === undefined ? {} : { pending: input.pending }),
              now: yield* DateTime.now,
              expiresAt: session.expiresAt,
              absoluteExpiresAt: session.absoluteExpiresAt,
            },
            (_, journal) => {
              journal.stage(event);
              journal.stage(creation);

              return journal.prepare(issue(session, credential));
            },
          );
        });

        const strategy = SessionStrategy.of({
          policy,
          capabilities,
          inspectForStepUp,
          inspect,
          verify,
          prepareEstablish: (input) => prepareEstablish(input),
          prepareHandoff: Effect.fn("SignedSession.prepareHandoff")(function* (input) {
            const handoff = yield* prepareHandoffIssuance(input);

            return yield* prepareEstablish(handoff.issuance, handoff.source);
          }),
          prepareRenew: Effect.fn("SignedSession.prepareRenew")(function* (
            credential: Redacted.Redacted<string>,
          ) {
            const source = yield* inspect(credential);
            const session = source.session;
            const now = yield* DateTime.now;

            yield* checkRenewalDue(session, now, policy);

            const renewed = {
              ...session,
              issuedAt: now,
              expiresAt: DateTime.makeUnsafe(
                Math.min(
                  DateTime.toEpochMillis(session.absoluteExpiresAt),
                  DateTime.toEpochMillis(now) + policy.idleLifetimeMillis,
                ),
              ),
            };

            const next = yield* encode({
              session: renewed,
              provenance: source.provenance,
              credentialVersion: SessionCredentialVersion.make(
                Redacted.value(yield* secrets.generate()),
              ),
            });

            const event = yield* prepareHooks("session-creation", renewed).pipe(
              Effect.provide(services),
            );

            yield* validateSessionTimeline(session, policy);
            yield* validateSessionTimeline(renewed, policy);
            if (Option.isSome(validity)) yield* validity.value.verify(session, yield* DateTime.now);

            // Signed renewal has no write/transaction. The original absolute bound and authentication time survive replay.
            const result = yield* coordinateCommit(
              (journal) =>
                Effect.sync(() => {
                  journal.stage(event);

                  return journal.prepare(issue(renewed, next));
                }),
              { mode: "interactive" },
            ).pipe(
              Effect.provideService(LifecycleHooks, hooks),
              Effect.mapError(() => SessionUnavailable.make({})),
            );

            return result.value;
          }),
          signOut: Effect.fn("SignedSession.signOut")(function* (
            credential: Redacted.Redacted<string>,
          ) {
            const outcome = yield* Effect.gen(function* () {
              const event = yield* prepareHooks("sign-out").pipe(Effect.provide(services));

              if (Option.isSome(validity)) {
                const session = yield* verify(credential);

                const receipt = yield* validity.value.revoke(
                  {
                    subjectId: session.subjectId,
                    sessionId: session.sessionId,
                    absoluteExpiresAt: session.absoluteExpiresAt,
                    expectedSecurityRevision: session.securityRevision,
                  },
                  (_, journal) => {
                    journal.stage(event);

                    return journal.prepare({
                      clearCredential: true as const,
                      invalidation: "revoked" as const,
                    });
                  },
                );

                return yield* readCommitted(receipt);
              }

              const result = yield* coordinateCommit(
                (journal) =>
                  Effect.sync(() => {
                    journal.stage(event);

                    return journal.prepare({
                      clearCredential: true as const,
                      invalidation: "client-only" as const,
                    });
                  }),
                { mode: "interactive" },
              ).pipe(
                Effect.provideService(LifecycleHooks, hooks),
                Effect.mapError(() => SessionUnavailable.make({})),
              );

              return yield* readCommitted(result.value);
            }).pipe(reportSignOutFailure, Effect.result);

            const value: SignOutResult =
              outcome._tag === "Failure"
                ? outcome.failure._tag === "SessionInvalid"
                  ? { clearCredential: true, invalidation: "already-invalid" }
                  : SessionSignOutUnavailable.make({ clearCredential: true })
                : outcome.success;

            return {
              value,
              credentialCommands: [{ _tag: "Clear" as const, slot: "session" as const }],
            };
          }),
          list: () => unsupported("session-listing"),
          revoke: Effect.fn("SignedSession.revoke")(function* (session, sessionId) {
            if (Option.isNone(validity)) return yield* unsupported("per-session-revocation");
            const event = yield* prepareHooks("sign-out", session).pipe(Effect.provide(services));

            return yield* readCommitted(
              yield* validity.value.revoke(
                {
                  subjectId: session.subjectId,
                  sessionId,
                  absoluteExpiresAt: DateTime.add(yield* DateTime.now, {
                    milliseconds: policy.maximumIssuedAbsoluteLifetimeMillis,
                  }),
                  expectedSecurityRevision: session.securityRevision,
                },
                (_, journal) => {
                  journal.stage(event);

                  return journal.prepare(undefined);
                },
              ),
            );
          }),
          revokeAll: Effect.fn("SignedSession.revokeAll")(function* (session) {
            if (Option.isNone(validity)) return yield* unsupported("subject-invalidation");
            const event = yield* prepareHooks("sign-out", session).pipe(Effect.provide(services));

            return yield* readCommitted(
              yield* validity.value.revokeAll(
                {
                  subjectId: session.subjectId,
                  expectedSecurityRevision: session.securityRevision,
                },
                (_, journal) => {
                  journal.stage(event);

                  return journal.prepare(undefined);
                },
              ),
            );
          }),
        });

        const plan = Effect.fn("SignedSession.planStepUpReplacement")(function* (
          source: SessionStepUpSource<Claims["Type"]>,
          evidence: AuthenticationEvidence,
          assurance: AuthenticationAssurance,
        ) {
          const expectedTag = Option.isSome(validity) ? "StateAssistedSigned" : "StatelessSigned";

          if (source.guard._tag !== expectedTag) return yield* SessionStepUpInvalid.make({});

          const session = yield* replacementSession(
            source.inspection.session,
            evidence,
            assurance,
            policy,
            SessionId.make(Redacted.value(yield* secrets.generate())),
          );

          const inspection = yield* inspectProvenance(
            session,
            { evidence },
            SessionCredentialVersion.make(Redacted.value(yield* secrets.generate())),
          );

          const credential = yield* encode(inspection);

          const replacement: SessionStepUpReplacement<Claims["Type"]> = Option.isSome(validity)
            ? Object.freeze({
                _tag: "StateAssistedSigned",
                inspection,
                tombstoneSessionId: source.inspection.session.sessionId,
                tombstoneUntil: source.inspection.session.absoluteExpiresAt,
              })
            : Object.freeze({ _tag: "StatelessSigned", inspection });

          return { credential, replacement };
        });

        return Context.make(SessionStrategy, strategy).pipe(Context.add(StepUpPlanner, { plan }));
      }),
    );

    // Mode is the literal selected by the two public constructors below.
    // @effect-diagnostics-next-line unsafeEffectTypeAssertion:off
    return layer as Layer.Layer<
      Layer.Success<typeof layer>,
      Layer.Error<typeof layer>,
      | Exclude<
          Layer.Services<typeof layer>,
          Context.Service.Identifier<typeof SignedSessionValidity>
        >
      | (Mode extends "state-assisted"
          ? Context.Service.Identifier<typeof SignedSessionValidity>
          : never)
    >;
  };

  const statelessLayer = (policy: SessionPolicy, keyring: SessionSigningKeyring) =>
    signedLayer(policy, keyring, "stateless");

  const stateAssistedLayer = (policy: SessionPolicy, keyring: SessionSigningKeyring) =>
    signedLayer(policy, keyring, "state-assisted");

  const AuthenticationCompletion = Context.Service<
    ModuleService<Id, "completion", Claims["Type"]>,
    {
      readonly prepare: (input: Issuance) => Prepared<CompletionResult>;
      /** Internal-only lookup authenticated by the private pending bearer. No claims
       * or normal session authority; final preparePending still rechecks/consumes. */
      readonly pendingContext: (
        credential: Redacted.Redacted<string>,
      ) => Effect.Effect<PendingAuthenticationContext, Failure>;
      /** Charge a rejected additional factor without caller-supplied binding data.
       * Read the returned receipt before reporting the rejection to its caller. */
      readonly rejectPendingCredential: (
        credential: Redacted.Redacted<string>,
      ) => Effect.Effect<PreparedCommit<{ readonly _tag: "Rejected" }>, Failure>;
      /** Only method implementations call this after independently verifying the next proof. */
      readonly preparePending: (input: {
        readonly credential: Redacted.Redacted<string>;
        readonly additional: AuthenticationEvidence;
      }) => Prepared<CompletionResult>;
      readonly rejectPending: (input: {
        readonly credential: Redacted.Redacted<string>;
        readonly bindingDigest: TokenDigest;
      }) => Effect.Effect<PreparedCommit<{ readonly _tag: "Rejected" }>, Failure>;
    }
  >(`effect-auth/sessions/${moduleId}/Completion`);

  type PendingConfiguration = {
    readonly pendingLifetimeMillis: number;
    readonly attemptLimit: number;
  };

  const makeCompletionLayer = <R>(
    inputConfiguration: PendingConfiguration | undefined,
    pending: Effect.Effect<Option.Option<PendingPort<Claims["Type"]>>, never, R>,
  ): CompletionLayer<Id, Claims, R> =>
    Layer.effect(
      AuthenticationCompletion,
      Effect.gen(function* () {
        const configuration =
          inputConfiguration === undefined
            ? undefined
            : Object.freeze(
                yield* Schema.decodeEffect(
                  Schema.Struct({
                    pendingLifetimeMillis: Schema.Int.check(
                      Schema.isBetween({ minimum: 1, maximum: 900000 }),
                    ),
                    attemptLimit: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 100 })),
                  }),
                )(inputConfiguration).pipe(
                  Effect.mapError(() =>
                    SessionConfigurationError.make({ reason: "pending-authentication" }),
                  ),
                ),
              );

        const pendingPort = yield* pending;
        const strategy = yield* SessionStrategy;
        const authority = yield* AuthenticationAuthority;
        const secrets = yield* makeSessionSecrets(moduleId);

        const claimServices = yield* Effect.context<
          Claims["DecodingServices"] | Claims["EncodingServices"]
        >();

        const codec = Schema.toCodecIso(ClaimsCodec);

        const projectClaims = (value: Claims["Type"]) =>
          Schema.encodeEffect(codec)(value).pipe(
            Effect.flatMap(Schema.decodeEffect(codec)),
            Effect.provide(claimServices),
            Effect.mapError(() => SessionInvalid.make({})),
          );

        const completed = (
          receipt: PreparedCommit<AuthOperationResult<Session>>,
        ): PreparedCommit<AuthOperationResult<CompletionResult>> => ({
          _tag: "PreparedCommit",
          read: receipt.read.pipe(
            Effect.map(({ value, credentialCommands }) => ({
              value: { _tag: "Authenticated" as const, session: value },
              credentialCommands,
            })),
          ),
        });

        const prepare: (input: Issuance) => Prepared<CompletionResult> = Effect.fn(
          "AuthenticationCompletion.prepare",
        )(function* (input: Issuance) {
          input = { ...input, evidence: yield* snapshotAuthenticationEvidence(input.evidence) };
          const checkedClaims = yield* projectClaims(input.claims);
          const requirement = yield* authority.requirements(input.evidence);

          const assessed = yield* assessAuthentication(input.evidence, requirement).pipe(
            Effect.mapError(() => SessionInvalid.make({})),
          );

          if (assessed.satisfied)
            return completed(
              yield* strategy
                .prepareEstablish({ ...input, claims: checkedClaims })
                .pipe(Effect.provideService(AuthenticationAuthority, authority)),
            );
          if (
            input.pending !== undefined ||
            configuration === undefined ||
            Option.isNone(pendingPort)
          )
            return yield* SessionCapabilityUnsupported.make({
              capability: "required-additional-authentication",
            });
          const now = yield* DateTime.now;

          const expiresAt = DateTime.makeUnsafe(
            Math.min(
              DateTime.toEpochMillis(now) + configuration.pendingLifetimeMillis,
              DateTime.toEpochMillis(assessed.assurance.authenticatedAt) +
                requirement.maximumAgeMillis,
            ),
          );

          const credential = yield* secrets.generate();
          const digest = yield* secrets.digest(credential, "pending");

          return yield* pendingPort.value.create(
            {
              digest,
              evidence: input.evidence,
              claims: checkedClaims,
              expiresAt,
              attemptLimit: configuration.attemptLimit,
            },
            now,
            (record, journal) =>
              journal.prepare({
                value: { _tag: "PendingAuthentication" as const, expiresAt: record.expiresAt },
                credentialCommands: [
                  {
                    _tag: "Issue" as const,
                    slot: "pending-proof" as const,
                    credential,
                    expiresAtMillis: DateTime.toEpochMillis(record.expiresAt),
                  },
                ],
              }),
          );
        });

        const pendingContext = Effect.fn("AuthenticationCompletion.pendingContext")(function* (
          credential: Redacted.Redacted<string>,
        ) {
          if (Option.isNone(pendingPort))
            return yield* SessionCapabilityUnsupported.make({
              capability: "pending-authentication",
            });
          const digest = yield* secrets.digest(credential, "pending");

          return yield* snapshotPendingAuthenticationContext(
            yield* pendingPort.value.context({
              digest,
              now: yield* DateTime.now,
            }),
          );
        });

        return AuthenticationCompletion.of({
          prepare,
          pendingContext,
          rejectPendingCredential: Effect.fn("AuthenticationCompletion.rejectPendingCredential")(
            function* (credential) {
              if (Option.isNone(pendingPort))
                return yield* SessionCapabilityUnsupported.make({
                  capability: "pending-authentication",
                });
              const digest = yield* secrets.digest(credential, "pending");

              const context = yield* snapshotPendingAuthenticationContext(
                yield* pendingPort.value.context({ digest, now: yield* DateTime.now }),
              );

              return yield* pendingPort.value.reject(
                { digest, bindingDigest: context.bindingDigest, now: yield* DateTime.now },
                (decision, journal) => journal.prepare(decision),
              );
            },
          ),
          preparePending: Effect.fn("AuthenticationCompletion.preparePending")(function* (input) {
            if (Option.isNone(pendingPort))
              return yield* SessionCapabilityUnsupported.make({
                capability: "pending-authentication",
              });
            const digest = yield* secrets.digest(input.credential, "pending");

            const record = yield* pendingPort.value.read({
              digest,
              bindingDigest: input.additional.bindingDigest,
              now: yield* DateTime.now,
            });

            const evidence = yield* combineAuthenticationEvidence(
              record.evidence,
              input.additional,
            );

            const receipt = yield* prepare({
              evidence,
              claims: record.claims,
              pending: {
                digest,
                bindingDigest: evidence.bindingDigest,
                flowId: evidence.flowId,
                version: record.version,
              },
            });

            return {
              _tag: "PreparedCommit" as const,
              read: receipt.read.pipe(
                Effect.map((result) => ({
                  value: result.value,
                  credentialCommands: [
                    ...result.credentialCommands,
                    { _tag: "Clear" as const, slot: "pending-proof" as const },
                  ],
                })),
              ),
            };
          }),
          rejectPending: Effect.fn("AuthenticationCompletion.rejectPending")(function* (input) {
            if (Option.isNone(pendingPort))
              return yield* SessionCapabilityUnsupported.make({
                capability: "pending-authentication",
              });

            return yield* pendingPort.value.reject(
              {
                digest: yield* secrets.digest(input.credential, "pending"),
                bindingDigest: input.bindingDigest,
                now: yield* DateTime.now,
              },
              (decision, journal) => journal.prepare(decision),
            );
          }),
        });
      }),
    );

  function completionLayer(): CompletionLayer<Id, Claims>;
  function completionLayer(
    configuration: PendingConfiguration,
  ): CompletionLayer<Id, Claims, ModuleService<Id, "pending", Claims["Type"]>>;
  function completionLayer(configuration?: PendingConfiguration) {
    const captured = configuration === undefined ? undefined : Object.freeze({ ...configuration });

    return makeCompletionLayer(
      captured,
      captured === undefined
        ? Effect.serviceOption(PendingAuthentication)
        : Effect.map(PendingAuthentication, Option.some),
    );
  }

  const SessionStepUp = Context.Service<
    ModuleService<Id, "step-up", Claims["Type"]>,
    {
      readonly prepareBegin: (input: {
        readonly sourceCredential: Redacted.Redacted<string>;
        readonly profileId: SessionStepUpProfileId;
      }) => Prepared<StepUpPending>;
      readonly context: (
        credential: Redacted.Redacted<string>,
      ) => Effect.Effect<PendingAuthenticationContext, Failure>;
      readonly rejectCredential: (
        credential: Redacted.Redacted<string>,
      ) => Effect.Effect<PreparedCommit<{ readonly _tag: "Rejected" }>, Failure>;
      readonly prepareComplete: (input: {
        readonly sourceCredential: Redacted.Redacted<string>;
        readonly stepUpCredential: Redacted.Redacted<string>;
        readonly additional: AuthenticationEvidence;
      }) => Prepared<Session>;
    }
  >(`effect-auth/sessions/${moduleId}/StepUp`);

  const freezeInstant = (input: DateTime.Utc) => {
    const copy = DateTime.makeUnsafe(DateTime.toEpochMillis(input));

    Object.freeze(DateTime.toPartsUtc(copy));

    return Object.freeze(copy);
  };

  const snapshotRequirement = (input: AuthenticationRequirement) =>
    Object.freeze({
      ...input,
      alternatives: Object.freeze(
        EffectArray.map(input.alternatives, (alternative) =>
          Object.freeze({
            ...alternative,
            factors: Object.freeze([...alternative.factors]),
          }),
        ),
      ),
    });

  const boundedRequirement = (input: AuthenticationRequirement) =>
    Array.isArray(input?.alternatives) &&
    input.alternatives.length > 0 &&
    input.alternatives.length <= 16 &&
    input.alternatives.every(
      (alternative) => Array.isArray(alternative?.factors) && alternative.factors.length <= 3,
    );

  const readRequirement = (input: AuthenticationRequirement) =>
    boundedRequirement(input)
      ? Schema.decodeEffect(SessionStepUpRequirement)(input).pipe(
          Effect.map(snapshotRequirement),
          Effect.mapError(() => SessionUnavailable.make({})),
        )
      : Effect.fail(SessionUnavailable.make({}));

  const intentCodec = Schema.toCodecJson(Schema.toType(SessionStepUpIntent));

  const snapshotIntent = Effect.fn("SessionStepUp.snapshotIntent")(function* (
    input: SessionStepUpIntent,
  ) {
    if (
      !Array.isArray(input?.revision?.credentials) ||
      input.revision.credentials.length > 64 ||
      !boundedRequirement(input?.requirement)
    )
      return yield* SessionStepUpInvalid.make({});

    const value = yield* Schema.encodeEffect(intentCodec)(input).pipe(
      Effect.flatMap(Schema.decodeEffect(intentCodec)),
      Effect.mapError(() => SessionStepUpInvalid.make({})),
    );

    return Object.freeze({
      ...value,
      revision: Object.freeze({
        ...value.revision,
        credentials: Object.freeze(
          value.revision.credentials.map((item) => Object.freeze({ ...item })),
        ),
      }),
      requirement: snapshotRequirement(value.requirement),
      sourceAuthenticatedAt: freezeInstant(value.sourceAuthenticatedAt),
      sourceExpiresAt: freezeInstant(value.sourceExpiresAt),
      sourceAbsoluteExpiresAt: freezeInstant(value.sourceAbsoluteExpiresAt),
      expiresAt: freezeInstant(value.expiresAt),
    });
  });

  const inspectionCodec = Schema.toCodecJson(
    Schema.toType(
      Schema.Struct({
        session: Session,
        provenance: SessionAuthenticationProvenance,
        credentialVersion: SessionCredentialVersion,
      }),
    ),
  );

  // Only detached schema Type values reach this helper. DateTime caches must be
  // materialized before freezing; consumer collections are detached by the codec.
  const freezeGraph = <A>(value: A): A => {
    if (value !== null && typeof value === "object") {
      if (DateTime.isDateTime(value) && DateTime.isUtc(value)) {
        Object.freeze(DateTime.toPartsUtc(value));
        Object.freeze(value);
      } else if (
        Array.isArray(value) ||
        Object.getPrototypeOf(value) === Object.prototype ||
        Object.getPrototypeOf(value) === null ||
        Schema.is(AuthenticationAssurance)(value)
      ) {
        for (const child of Object.values(value)) freezeGraph(child);
        Object.freeze(value);
      }
      // Consumer typed arrays, collections and opaque class instances stay valid
      // Type values. Detachment, not Object.freeze, isolates their mutable storage.
    }

    return value;
  };

  const snapshotInspection = (input: Inspection) =>
    Schema.encodeEffect(inspectionCodec)(input).pipe(
      Effect.flatMap(Schema.decodeEffect(inspectionCodec)),
      Effect.map(freezeGraph),
      Effect.mapError(() => SessionStepUpInvalid.make({})),
    );

  const requirementEncoding = Schema.encodeSync(Schema.fromJsonString(AuthenticationRequirement));

  const profileEncoding = Schema.encodeSync(
    Schema.fromJsonString(
      Schema.Tuple([
        Schema.Literal("effect-auth/session-step-up/profile/v1"),
        Schema.String,
        SessionStepUpProfile,
      ]),
    ),
  );

  /** Configuration is decoded and detached before asynchronous hashing or Layer building. */
  const stepUpLayer = (configured: ReadonlyArray<SessionStepUpProfile>) => {
    const decoded = Schema.decodeResult(
      Schema.Array(SessionStepUpProfile).check(Schema.isMinLength(1), Schema.isMaxLength(64)),
    )(
      Array.isArray(configured) &&
        configured.length <= 64 &&
        configured.every((profile) => boundedRequirement(profile?.requirement))
        ? configured
        : [],
    );

    const profiles = Result.isSuccess(decoded)
      ? Object.freeze(
          decoded.success.map((profile) =>
            Object.freeze({
              ...profile,
              requirement: snapshotRequirement(profile.requirement),
            }),
          ),
        )
      : undefined;

    return Layer.effect(
      SessionStepUp,
      Effect.gen(function* () {
        if (
          profiles === undefined ||
          new Set(profiles.map((profile) => profile.profileId)).size !== profiles.length
        )
          return yield* SessionConfigurationError.make({ reason: "step-up" });
        const store = yield* SessionStepUpPersistence;
        const strategy = yield* SessionStrategy;
        const planner = yield* StepUpPlanner;
        const authority = yield* AuthenticationAuthority;
        const crypto = yield* Crypto.Crypto;
        const secrets = yield* makeSessionSecrets(moduleId);
        const hooks = yield* Effect.context<LifecycleHooks | Crypto.Crypto>();

        const registry = new Map<
          SessionStepUpProfileId,
          { readonly profile: SessionStepUpProfile; readonly digest: TokenDigest }
        >();

        for (const profile of profiles) {
          const bytes = new TextEncoder().encode(
            profileEncoding(["effect-auth/session-step-up/profile/v1", moduleId, profile]),
          );

          const digest = yield* crypto
            .digest("SHA-256", bytes)
            .pipe(Effect.mapError(() => SessionUnavailable.make({})));

          registry.set(
            profile.profileId,
            Object.freeze({ profile, digest: TokenDigest.make(Base64Url.encode(digest)) }),
          );
        }

        const assess = (evidence: AuthenticationEvidence, requirement: AuthenticationRequirement) =>
          assessAuthentication(evidence, requirement).pipe(
            Effect.catchTag("SessionConfigurationError", () =>
              Effect.fail(SessionUnavailable.make({})),
            ),
          );

        const digestCredential = (credential: Redacted.Redacted<string>) =>
          secrets
            .digest(credential, "step-up")
            .pipe(
              Effect.catchTag("SessionInvalid", () => Effect.fail(SessionStepUpInvalid.make({}))),
            );

        const inspectSource = (credential: Redacted.Redacted<string>) =>
          strategy.inspectForStepUp(credential).pipe(
            Effect.flatMap((source) =>
              snapshotInspection(source.inspection).pipe(
                Effect.map((inspection) =>
                  Object.freeze({ inspection, guard: Object.freeze({ ...source.guard }) }),
                ),
              ),
            ),
            Effect.catchTag("SessionInvalid", () => Effect.fail(SessionStepUpInvalid.make({}))),
          );

        const readIntent = Effect.fn("SessionStepUp.readIntent")(function* (
          digest: TokenDigest,
          bindingDigest: TokenDigest,
        ) {
          const intent = yield* snapshotIntent(
            yield* store.read({ digest, bindingDigest, now: yield* DateTime.now }),
          );

          const configured = registry.get(intent.profileId);
          const now = DateTime.toEpochMillis(yield* DateTime.now);

          if (
            intent.digest !== digest ||
            intent.bindingDigest !== bindingDigest ||
            configured === undefined ||
            intent.profileGeneration !== configured.profile.generation ||
            intent.profileDigest !== configured.digest ||
            requirementEncoding(intent.requirement) !==
              requirementEncoding(configured.profile.requirement) ||
            intent.attemptLimit !== configured.profile.attemptLimit ||
            now >= DateTime.toEpochMillis(intent.expiresAt) ||
            DateTime.toEpochMillis(intent.expiresAt) >
              DateTime.toEpochMillis(intent.sourceExpiresAt) ||
            DateTime.toEpochMillis(intent.sourceExpiresAt) >
              DateTime.toEpochMillis(intent.sourceAbsoluteExpiresAt)
          )
            return yield* SessionStepUpInvalid.make({});

          return intent;
        });

        const matchSource = (
          intent: SessionStepUpIntent,
          source: SessionStepUpSource<Claims["Type"]>,
        ) => {
          const { session, credentialVersion, provenance } = source.inspection;
          const revision = provenance.evidence.revision;

          const sameRevisions =
            revision.credentials.length === intent.revision.credentials.length &&
            revision.credentials.every((item) =>
              intent.revision.credentials.some(
                (expected) =>
                  expected.credentialId === item.credentialId &&
                  expected.revision === item.revision,
              ),
            );

          return (
            intent.sourceKind === source.guard._tag &&
            intent.sourceSessionId === session.sessionId &&
            intent.sourceCredentialVersion === credentialVersion &&
            intent.revision.subjectId === revision.subjectId &&
            intent.revision.securityRevision === revision.securityRevision &&
            sameRevisions &&
            DateTime.toEpochMillis(intent.sourceAuthenticatedAt) ===
              DateTime.toEpochMillis(session.assurance.authenticatedAt) &&
            DateTime.toEpochMillis(intent.sourceExpiresAt) ===
              DateTime.toEpochMillis(session.expiresAt) &&
            DateTime.toEpochMillis(intent.sourceAbsoluteExpiresAt) ===
              DateTime.toEpochMillis(session.absoluteExpiresAt)
          );
        };

        return SessionStepUp.of({
          prepareBegin: Effect.fn("SessionStepUp.prepareBegin")(function* (input) {
            const configured = registry.get(input.profileId);

            if (configured === undefined) return yield* SessionStepUpInvalid.make({});
            const source = yield* inspectSource(input.sourceCredential);
            const evidence = source.inspection.provenance.evidence;

            // requirements checks current status/revisions but does not require the
            // old source proofs to satisfy the new profile before requesting it.
            yield* readRequirement(yield* authority.requirements(evidence));
            const credential = yield* secrets.generate();
            const digest = yield* digestCredential(credential);

            const bindingDigest = yield* secrets.digest(
              yield* secrets.generate(),
              "step-up-binding",
            );

            const flowId = AuthenticationFlowId.make(Redacted.value(yield* secrets.generate()));
            const now = yield* DateTime.now;
            const session = source.inspection.session;

            yield* validateSessionTimeline(session, strategy.policy);

            const expiresAt = freezeInstant(
              DateTime.makeUnsafe(
                Math.min(
                  DateTime.toEpochMillis(now) + configured.profile.lifetimeMillis,
                  DateTime.toEpochMillis(session.expiresAt),
                  DateTime.toEpochMillis(session.absoluteExpiresAt),
                ),
              ),
            );

            const intent: Omit<SessionStepUpIntent, "version"> = Object.freeze({
              _tag: "SessionStepUpIntent",
              digest,
              flowId,
              bindingDigest,
              revision: evidence.revision,
              sourceKind: source.guard._tag,
              sourceSessionId: session.sessionId,
              sourceCredentialVersion: source.inspection.credentialVersion,
              sourceAuthenticatedAt: freezeInstant(session.assurance.authenticatedAt),
              sourceExpiresAt: freezeInstant(session.expiresAt),
              sourceAbsoluteExpiresAt: freezeInstant(session.absoluteExpiresAt),
              profileId: configured.profile.profileId,
              profileGeneration: configured.profile.generation,
              profileDigest: configured.digest,
              requirement: configured.profile.requirement,
              expiresAt,
              attemptLimit: configured.profile.attemptLimit,
            });

            return yield* store.create(intent, now, (_, journal) =>
              journal.prepare({
                value: { _tag: "StepUpPending" as const, profileId: intent.profileId, expiresAt },
                credentialCommands: [
                  {
                    _tag: "Issue" as const,
                    slot: "session-step-up" as const,
                    credential,
                    expiresAtMillis: DateTime.toEpochMillis(expiresAt),
                  },
                ],
              }),
            );
          }),
          context: Effect.fn("SessionStepUp.context")(function* (credential) {
            const digest = yield* digestCredential(credential);

            return yield* snapshotPendingAuthenticationContext(
              yield* store.context({ digest, now: yield* DateTime.now }),
            ).pipe(
              Effect.catchTag("PendingAuthenticationInvalid", () =>
                Effect.fail(SessionStepUpInvalid.make({})),
              ),
            );
          }),
          rejectCredential: Effect.fn("SessionStepUp.rejectCredential")(function* (credential) {
            const digest = yield* digestCredential(credential);

            return yield* store.reject({ digest, now: yield* DateTime.now }, (decision, journal) =>
              journal.prepare(decision),
            );
          }),
          prepareComplete: Effect.fn("SessionStepUp.prepareComplete")(function* (input) {
            const additional = yield* snapshotAuthenticationEvidence(input.additional);
            const digest = yield* digestCredential(input.stepUpCredential);
            const intent = yield* readIntent(digest, additional.bindingDigest);
            const source = yield* inspectSource(input.sourceCredential);

            if (!matchSource(intent, source)) return yield* SessionStepUpInvalid.make({});
            const original = source.inspection.provenance.evidence;

            const evidence = yield* snapshotAuthenticationEvidence(
              yield* combineAuthenticationEvidence(
                {
                  ...original,
                  flowId: intent.flowId,
                  bindingDigest: intent.bindingDigest,
                },
                additional,
              ).pipe(
                Effect.catchTag("PendingAuthenticationInvalid", () =>
                  Effect.fail(SessionStepUpInvalid.make({})),
                ),
              ),
            );

            const requirement = yield* readRequirement(yield* authority.requirements(evidence));
            const base = yield* assess(evidence, requirement);
            const profile = yield* assess(evidence, intent.requirement);

            if (!base.satisfied || !profile.satisfied) return yield* SessionStepUpInvalid.make({});
            const generated = yield* planner.plan(source, evidence, base.assurance);

            const replacement = Object.freeze({
              ...generated.replacement,
              inspection: yield* snapshotInspection(generated.replacement.inspection),
            });

            // Retain a separate private output graph: a consumer owner cannot alter
            // the credential's paired public value through its persistence plan.
            const output = yield* snapshotInspection(generated.replacement.inspection);
            const planned = { credential: generated.credential, replacement };

            if (planned.replacement._tag !== intent.sourceKind)
              return yield* SessionStepUpInvalid.make({});

            const event = yield* prepareHooks(
              "session-creation",
              planned.replacement.inspection.session,
            ).pipe(Effect.provide(hooks));

            // Hooks may suspend. Re-read source authority and assess both independent
            // policies again; the native owner must repeat them at its commit clock.
            const current = yield* inspectSource(input.sourceCredential);

            if (
              !matchSource(intent, current) ||
              (source.guard._tag === "Stateful" &&
                (current.guard._tag !== "Stateful" ||
                  source.guard.digest !== current.guard.digest ||
                  source.guard.rowVersion !== current.guard.rowVersion))
            )
              return yield* SessionStepUpInvalid.make({});

            const currentRequirement = yield* readRequirement(
              yield* authority.requirements(evidence),
            );

            if (
              !(yield* assess(evidence, currentRequirement)).satisfied ||
              !(yield* assess(evidence, intent.requirement)).satisfied
            )
              return yield* SessionStepUpInvalid.make({});
            yield* validateSessionTimeline(planned.replacement.inspection.session, strategy.policy);
            const now = yield* DateTime.now;

            if (DateTime.toEpochMillis(now) >= DateTime.toEpochMillis(intent.expiresAt))
              return yield* SessionStepUpInvalid.make({});

            const plan: SessionStepUpCompletionPlan<Claims["Type"]> = Object.freeze({
              intent,
              source: current,
              evidence,
              baseRequirement: currentRequirement,
              profileRequirement: intent.requirement,
              now: freezeInstant(now),
              replacement: planned.replacement,
            });

            return yield* store.complete(plan, (_, journal) => {
              const result = issue(output.session, planned.credential);

              journal.stage(event);

              return journal.prepare({
                ...result,
                credentialCommands: [
                  ...result.credentialCommands,
                  { _tag: "Clear" as const, slot: "session-step-up" as const },
                ],
              });
            });
          }),
        });
      }),
    );
  };

  const { Begin: StepUpBegin, Complete: StepUpComplete, Reject: StepUpReject } = stepUpOperations;

  const stepUpHandlersLayer = Layer.mergeAll(
    StepUpBegin.credentialHandlerLayer(
      Effect.fn("SessionStepUp.Begin")(function* (input, context) {
        yield* checkNoAmbientCommit();
        const caller = yield* requireAuthenticated(context);
        const source = yield* (yield* SessionStrategy).inspectForStepUp(input.sourceCredential);

        if (
          caller.subjectId !== source.inspection.session.subjectId ||
          caller.sessionId !== source.inspection.session.sessionId
        )
          return yield* SessionStepUpInvalid.make({});

        return yield* readCommitted(yield* (yield* SessionStepUp).prepareBegin(input));
      }),
    ),
    StepUpComplete.credentialHandlerLayer(
      Effect.fn("SessionStepUp.Complete")(function* (input) {
        yield* checkNoAmbientCommit();

        return yield* readCommitted(yield* (yield* SessionStepUp).prepareComplete(input));
      }),
    ),
    StepUpReject.handlerLayer(
      Effect.fn("SessionStepUp.Reject")(function* (input) {
        yield* checkNoAmbientCommit();

        return yield* readCommitted(
          yield* (yield* SessionStepUp).rejectCredential(input.stepUpCredential),
        );
      }),
    ),
  );

  const {
    Complete,
    CompletePending,
    RejectPending,
    Capabilities,
    Verify,
    Renew,
    SignOut,
    List,
    Revoke,
    RevokeAll,
  } = operations;

  const capabilitiesHandlerLayer = Capabilities.handlerLayer(
    Effect.fn("Session.Capabilities")(function* () {
      return (yield* SessionStrategy).capabilities;
    }),
  );

  /** Verification, renewal and sign-out need no authentication-completion authority. */
  const sessionHandlersLayer = Layer.mergeAll(
    Verify.handlerLayer(
      Effect.fn("Session.Verify")(function* (input) {
        return yield* (yield* SessionStrategy).verify(input.credential);
      }),
    ),
    Renew.credentialHandlerLayer(
      Effect.fn("Session.Renew")(function* (input) {
        yield* checkNoAmbientCommit();

        return yield* readCommitted(yield* (yield* SessionStrategy).prepareRenew(input.credential));
      }),
    ),
    SignOut.credentialHandlerLayer(
      Effect.fn("Session.SignOut")(function* (input) {
        yield* checkNoAmbientCommit();

        return yield* (yield* SessionStrategy).signOut(input.credential);
      }),
    ),
  );

  const handlersLayer = (management: AssuranceRequirement) => {
    management = Object.freeze({
      ...management,
      ...(management.factors === undefined
        ? {}
        : { factors: Object.freeze([...management.factors]) }),
    });

    return Layer.mergeAll(
      capabilitiesHandlerLayer,
      Complete.credentialHandlerLayer(
        Effect.fn("Session.Complete")(function* (input) {
          yield* checkNoAmbientCommit();

          return yield* readCommitted(yield* (yield* AuthenticationCompletion).prepare(input));
        }),
      ),
      CompletePending.credentialHandlerLayer(
        Effect.fn("Session.CompletePending")(function* (input) {
          yield* checkNoAmbientCommit();

          return yield* readCommitted(
            yield* (yield* AuthenticationCompletion).preparePending(input),
          );
        }),
      ),
      RejectPending.handlerLayer(
        Effect.fn("Session.RejectPending")(function* (input) {
          yield* checkNoAmbientCommit();

          return yield* readCommitted(
            yield* (yield* AuthenticationCompletion).rejectPending(input),
          );
        }),
      ),
      sessionHandlersLayer,
      List.handlerLayer(
        Effect.fn("Session.List")(function* (input, context) {
          const caller = yield* requireAuthenticated(context);
          const strategy = yield* SessionStrategy;
          const session = yield* strategy.verify(input.credential);

          if (session.subjectId !== caller.subjectId) return yield* SessionInvalid.make({});

          return yield* strategy.list({
            ...(input.cursor === undefined ? {} : { cursor: input.cursor }),
            limit: input.limit,
            subjectId: session.subjectId,
            now: yield* DateTime.now,
          });
        }),
      ),
      Revoke.handlerLayer(
        Effect.fn("Session.Revoke")(function* (input, context) {
          yield* checkNoAmbientCommit();
          const caller = yield* requireAssurance(context, management);
          const strategy = yield* SessionStrategy;
          const session = yield* strategy.verify(input.credential);

          if (session.subjectId !== caller.subjectId) return yield* SessionInvalid.make({});

          return yield* strategy.revoke(session, input.sessionId);
        }),
      ),
      RevokeAll.handlerLayer(
        Effect.fn("Session.RevokeAll")(function* (input, context) {
          yield* checkNoAmbientCommit();
          const caller = yield* requireAssurance(context, management);
          const strategy = yield* SessionStrategy;
          const session = yield* strategy.verify(input.credential);

          if (session.subjectId !== caller.subjectId) return yield* SessionInvalid.make({});
          yield* strategy.revokeAll(session);

          return sessionInvalidationWindow(
            "all-session-revocation",
            strategy.capabilities,
            strategy.policy,
          );
        }),
      ),
    );
  };

  return Object.freeze({
    moduleId,
    claims,
    /** Stateful sessions and authentication completion with portable defaults. */
    layer: (policy: SessionPolicy) =>
      completionLayer().pipe(
        Layer.provideMerge(statefulLayer(policy)),
        Layer.provide([cryptoLayer, hooksLayer]),
      ),
    Session,
    CompletionResult,
    SessionStrategy,
    SessionStepUp,
    SessionStepUpPersistence,
    stepUpLayer,
    stepUpHandlersLayer,
    stepUpOperations,
    stepUpGroup,
    AuthenticationCompletion,
    StatefulSessionPersistence,
    SessionRepository,
    SignedSessionValidity,
    PendingAuthentication,
    statefulLayer,
    statelessLayer,
    stateAssistedLayer,
    completionLayer,
    capabilitiesHandlerLayer,
    sessionHandlersLayer,
    handlersLayer,
    operations,
    group,
  });
};
