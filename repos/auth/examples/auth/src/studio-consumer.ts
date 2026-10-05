import {
  Auth,
  Hooks,
  type Operations,
  Passkey,
  Schema as AuthSchema,
  Sessions,
  Totp,
  WebCrypto,
} from "@yielded/auth";
import * as TotpCrypto from "@yielded/auth-crypto/Totp";
import * as Mapping from "@yielded/auth-persistence-drizzle";
import * as Native from "@yielded/auth-persistence-drizzle/Postgres";
import * as PasskeyProtocol from "@yielded/auth-simplewebauthn/Server";
import { eq } from "drizzle-orm";
import { boolean, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import type { Redacted } from "effect";
import { DateTime, Effect, Layer, Schema } from "effect";

import { StudioAuth, StudioClaims, sessions, authenticatorPolicy } from "./studio-auth";
import * as Studio from "./studio-passkey-schema";
export { StudioAuth, StudioClaims, sessions, authenticatorPolicy } from "./studio-auth";
type Claims = typeof StudioClaims.Type;
const instant = () => timestamp({ withTimezone: true, mode: "date" });

export const loginFlows = pgTable("studio_login_flows", {
  flowId: text().primaryKey(),
  subjectId: uuid().notNull(),
  state: text().notNull(),
  pendingDigest: text(),
  dedupUntil: instant().notNull(),
});

export const pendingLogins = pgTable("studio_pending_logins", {
  digest: text().primaryKey(),
  version: text().notNull(),
  flowId: text().notNull().unique(),
  subjectId: uuid().notNull(),
  bindingDigest: text().notNull(),
  expiresAt: instant().notNull(),
  attemptLimit: integer().notNull(),
  failedAttempts: integer().notNull(),
  consumed: boolean().notNull(),
  payload: text().notNull(),
});

export const activeSessions = pgTable("studio_sessions", {
  sessionId: text().primaryKey(),
  subjectId: uuid().notNull(),
  digest: text().notNull().unique(),
  version: text().notNull(),
  securityRevision: text().notNull(),
  issuedAt: instant().notNull(),
  expiresAt: instant().notNull(),
  absoluteExpiresAt: instant().notNull(),
  credentialVersion: text().notNull(),
  authenticatedAt: instant().notNull(),
  payload: text().notNull(),
});

export const factorSecrets = pgTable("studio_authenticators", {
  scope: text().primaryKey(),
  state: text().notNull(),
  version: text().notNull(),
});

export const stepUpIntents = pgTable("studio_step_up", {
  digest: text().primaryKey(),
  version: text().notNull(),
  flowId: text().notNull().unique(),
  subjectId: uuid().notNull(),
  bindingDigest: text().notNull(),
  snapshot: text().notNull(),
  expiresAt: instant().notNull(),
  attemptLimit: integer().notNull(),
  failedAttempts: integer().notNull(),
  consumed: boolean().notNull(),
});

export const registrationEvents = pgTable("studio_registration_events", {
  id: text().primaryKey(),
  snapshot: text().notNull(),
});

const sessionCodec = Schema.fromJsonString(
  Schema.Struct({
    ...sessions.Session.fields,
    digest: AuthSchema.TokenDigest,
    version: Sessions.SecurityRevision,
    provenance: Sessions.SessionAuthenticationProvenance,
    credentialVersion: Sessions.SessionCredentialVersion,
  }),
);

const pendingCodec = Schema.fromJsonString(
  Schema.Struct({
    digest: AuthSchema.TokenDigest,
    version: Sessions.SecurityRevision,
    evidence: Sessions.AuthenticationEvidence,
    claims: StudioClaims,
    expiresAt: Schema.DateTimeUtcFromMillis,
    attemptLimit: Schema.Int,
  }),
);

const nextRevision = () => Sessions.SecurityRevision.make(globalThis.crypto.randomUUID());
const requirement = Sessions.AuthenticationRequirement.make(Studio.requirement);

const twoCredentials = Sessions.AuthenticationRequirement.make({
  maximumAgeMillis: 120000,
  alternatives: [
    { factors: ["possession"], minimumCredentials: 2, userVerified: true, phishingResistant: true },
  ],
});

const requirementFor = (member: Readonly<Partial<typeof Studio.subject.$inferSelect>>) =>
  member.totpEnabled ? twoCredentials : requirement;

const common = {
  subject: {
    table: Studio.subject,
    id: "id",
    status: "status",
    securityRevision: "securityRevision",
    isActiveStatus: (value: unknown) => value === "active",
    decodeRequirement: (member) => Effect.succeed(requirementFor(member)),
    nextSecurityRevisionSync: nextRevision,
  },
  subjectId: {
    toNative: (id: AuthSchema.SubjectId) => Effect.succeed(String(id)),
    toSubject: (id: string) => Effect.succeed(AuthSchema.SubjectId.make(id)),
    equals: (left: string, right: string) => left === right,
  },
  credential: {
    table: Studio.factor,
    subjectId: "subjectId",
    credentialId: "credentialId",
    revision: "revision",
    status: "status",
    isActiveStatus: (value: unknown) => value === "active",
  },
} satisfies Mapping.SessionAuthorityTables<typeof Studio.subject, typeof Studio.factor, string>;

const flowMapping = {
  table: loginFlows,
  flowId: "flowId",
  subjectId: "subjectId",
  state: "state",
  pendingDigest: "pendingDigest",
  dedupUntil: "dedupUntil",
  pendingStateValue: "pending",
  establishedStateValue: "established",
  encodeInstant: DateTime.toDateUtc,
  decodeInstant: (value: unknown) =>
    // oxlint-disable-next-line no-restricted-properties -- native database timestamp is an unknown boundary.
    Schema.decodeUnknownEffect(Schema.Date)(value).pipe(
      Effect.map(DateTime.makeUnsafe),
      Effect.mapError(() =>
        Mapping.PersistenceMappingError.make({ operation: "studio.decode", cause: undefined }),
      ),
    ),
  encodePendingInsert: ({ evidence, subjectId, pendingDigest, dedupUntil }) => ({
    flowId: evidence.flowId,
    subjectId,
    state: "pending",
    pendingDigest,
    dedupUntil: DateTime.toDateUtc(dedupUntil),
  }),
  encodeEstablishedInsert: ({ evidence, subjectId, dedupUntil }) => ({
    flowId: evidence.flowId,
    subjectId,
    state: "established",
    pendingDigest: null,
    dedupUntil: DateTime.toDateUtc(dedupUntil),
  }),
} satisfies Mapping.SessionFlowTables<typeof loginFlows, string>["flow"];

const pendingMapping = {
  table: pendingLogins,
  digest: "digest",
  version: "version",
  flowId: "flowId",
  subjectId: "subjectId",
  bindingDigest: "bindingDigest",
  expiresAt: "expiresAt",
  attemptLimit: "attemptLimit",
  failedAttempts: "failedAttempts",
  consumed: "consumed",
  encodeInstant: DateTime.toDateUtc,
  allocateVersionSync: nextRevision,
  encodeInsert: (
    record: Sessions.PendingAuthenticationRecord<Claims>,
    ids: { subjectId: string },
  ) => ({
    digest: record.digest,
    version: record.version,
    flowId: record.evidence.flowId,
    subjectId: ids.subjectId,
    bindingDigest: record.evidence.bindingDigest,
    expiresAt: DateTime.toDateUtc(record.expiresAt),
    attemptLimit: record.attemptLimit,
    failedAttempts: 0,
    consumed: false,
    payload: Schema.encodeSync(pendingCodec)(record),
  }),
  decode: (row: typeof pendingLogins.$inferSelect) =>
    Schema.decodeEffect(pendingCodec)(row.payload).pipe(
      Effect.mapError(() =>
        Mapping.PersistenceMappingError.make({ operation: "studio.decode", cause: undefined }),
      ),
    ),
  decodeContext: (row: typeof pendingLogins.$inferSelect) =>
    Schema.decodeEffect(pendingCodec)(row.payload).pipe(
      Effect.mapError(() =>
        Mapping.PersistenceMappingError.make({ operation: "studio.decode", cause: undefined }),
      ),
    ),
} satisfies Mapping.PendingAuthenticationTables<
  Claims,
  typeof pendingLogins,
  typeof loginFlows,
  string
>["pending"];

const encodeSession = (record: Sessions.StatefulSessionRecord<Claims>) => ({
  sessionId: record.sessionId,
  subjectId: record.subjectId,
  digest: record.digest,
  version: record.version,
  securityRevision: record.securityRevision,
  issuedAt: DateTime.toDateUtc(record.issuedAt),
  expiresAt: DateTime.toDateUtc(record.expiresAt),
  absoluteExpiresAt: DateTime.toDateUtc(record.absoluteExpiresAt),
  credentialVersion: record.credentialVersion,
  authenticatedAt: DateTime.toDateUtc(record.assurance.authenticatedAt),
  payload: Schema.encodeSync(sessionCodec)(record),
});

const sessionMapping = {
  table: activeSessions,
  sessionId: "sessionId",
  subjectId: "subjectId",
  digest: "digest",
  version: "version",
  securityRevision: "securityRevision",
  issuedAt: "issuedAt",
  expiresAt: "expiresAt",
  absoluteExpiresAt: "absoluteExpiresAt",
  encodeInstant: DateTime.toDateUtc,
  encodeInsert: encodeSession,
  encodeRotation: encodeSession,
  decode: (row: typeof activeSessions.$inferSelect) =>
    Schema.decodeEffect(sessionCodec)(row.payload).pipe(
      Effect.map((record) => ({
        ...record,
        digest: AuthSchema.TokenDigest.make(row.digest),
        version: Sessions.SecurityRevision.make(row.version),
      })),
      Effect.mapError(() =>
        Mapping.PersistenceMappingError.make({ operation: "studio.decode", cause: undefined }),
      ),
    ),
  allocateIdSync: () => globalThis.crypto.randomUUID(),
  allocateVersionSync: nextRevision,
} satisfies Mapping.StatefulSessionTables<
  Claims,
  typeof activeSessions,
  typeof loginFlows,
  string,
  string
>["session"];

const sessionId = {
  toNative: (id: Sessions.SessionId) => Effect.succeed(String(id)),
  toSession: (id: string) => Effect.succeed(Sessions.SessionId.make(id)),
  equals: (left: string, right: string) => left === right,
};

const nativeCommon = { ...common, isConstraintConflict: () => false };

export const sessionPolicy = Sessions.SessionPolicy.make({
  issuer: "design-studio",
  audience: "studio-members",
  generation: 1,
  idleLifetimeMillis: 300000,
  absoluteLifetimeMillis: 1800000,
  renewalIntervalMillis: 1000,
  maximumIssuedAbsoluteLifetimeMillis: 1800000,
  maximumTokenBytes: 8192,
  requireImmediateInvalidation: true,
});

/** The application accepts recently verified, current session provenance as its
 * management proof. Public assurance metadata never supplies credential evidence. */
const actionEvidence = Effect.fn("Studio.actionEvidence")(function* (
  proof: Redacted.Redacted<string> | undefined,
  subjectId: AuthSchema.SubjectId,
  flowId: string,
  bindingDigest: AuthSchema.TokenDigest,
) {
  if (proof === undefined) return yield* Sessions.SessionInvalid.make({});
  const strategy = yield* sessions.SessionStrategy;
  const inspected = yield* strategy.inspect(proof);

  if (inspected.session.subjectId !== subjectId) return yield* Sessions.SessionInvalid.make({});

  return Sessions.AuthenticationEvidence.make({
    ...inspected.provenance.evidence,
    flowId: Sessions.AuthenticationFlowId.make(flowId),
    bindingDigest,
  });
});

export const studioStorage = Layer.unwrap(
  Effect.gen(function* () {
    const db = yield* Native.Database;

    const authMapping = {
      ...nativeCommon,
      pending: { pending: pendingMapping, flow: flowMapping },
      constraints: Mapping.requiredPendingAuthenticationConstraints,
    };

    const { authenticationAuthority } =
      yield* Native.makeAuthenticationAuthorityServices(authMapping);

    const { pendingAuthentication } = yield* Native.makePendingAuthenticationServices({
      ...nativeCommon,
      pending: pendingMapping,
      flow: flowMapping,
      constraints: Mapping.requiredPendingAuthenticationConstraints,
    });

    const state = yield* Native.makeStatefulSessionServices({
      ...nativeCommon,
      session: sessionMapping,
      sessionId,
      flow: flowMapping,
      pending: pendingMapping,
      constraints: Mapping.requiredStatefulPendingConstraints,
    });

    const stepUp = yield* Native.makeSessionStepUpServices(
      {
        ...nativeCommon,
        intent: {
          table: stepUpIntents,
          digest: "digest",
          version: "version",
          flowId: "flowId",
          subjectId: "subjectId",
          bindingDigest: "bindingDigest",
          snapshot: "snapshot",
          expiresAt: "expiresAt",
          attemptLimit: "attemptLimit",
          failedAttempts: "failedAttempts",
          consumed: "consumed",
          encodeInstant: DateTime.toDateUtc,
          encodeInsert: (intent, ids) => ({
            digest: intent.digest,
            version: intent.version,
            flowId: intent.flowId,
            subjectId: ids.subjectId,
            bindingDigest: intent.bindingDigest,
            snapshot: Schema.encodeSync(Schema.fromJsonString(Sessions.SessionStepUpIntent))(
              intent,
            ),
            expiresAt: DateTime.toDateUtc(intent.expiresAt),
            attemptLimit: intent.attemptLimit,
            failedAttempts: 0,
            consumed: false,
          }),
          allocateVersionSync: nextRevision,
        },
        source: {
          kind: "Stateful",
          session: {
            ...sessionMapping,
            credentialVersion: "credentialVersion",
            authenticatedAt: "authenticatedAt",
          },
          sessionId,
          constraints: { sessionDigest: "unique(session.digest)" },
        },
        constraints: Mapping.requiredSessionStepUpConstraints,
      },
      sessions.SessionStepUpPersistence,
    );

    const registration = yield* Native.makePasskeyRegistrationServices(Studio.registrationMapping);

    // Subject security revision is the shared native authority for both existing
    // sessions and pending logins, so credential changes invalidate them immediately.
    const management = yield* Native.makePasskeyManagementServices({
      ...Studio.managementMapping,
      write: {
        ...Studio.write,
        policy: {
          ...Studio.write.policy,
          requirement: (row) => Effect.succeed(requirementFor(row)),
        },
      },
      invalidation: { ...Studio.managementMapping.invalidation, mutations: [] },
    });

    const assertions = yield* Native.makePasskeyPersistenceServices(Studio.base);
    const credentials = yield* Native.makePasskeyCredentialServices(Studio.read);

    const enrollment = yield* Native.makePasskeyEnrollmentContextServices({
      moduleId: Studio.base.moduleId,
      read: Studio.read,
      module: Studio.base.module,
    });

    const select = (purpose: string) =>
      purpose === "registration"
        ? registration.passkeyPersistence
        : purpose === "enrollment"
          ? management.passkeyPersistence
          : assertions.passkeyPersistence;

    const persistence = Passkey.PasskeyPersistence.of({
      ...assertions.passkeyPersistence,
      context: (input) => select(input.purpose).context(input),
      claim: (input, prepare) => select(input.ceremony.purpose).claim(input, prepare),
      settle: (input, prepare) => select(input.claim.ceremony.purpose).settle(input, prepare),
    });

    const totp = yield* Native.makeTotpPersistenceServices({
      moduleId: "studio/totp",
      policy: authenticatorPolicy,
      constraints: Mapping.requiredTotpConstraints,
      subjectIds: Studio.read.subjectIds,
      subject: {
        table: Studio.subject,
        id: "id",
        securityRevision: "securityRevision",
        factorEnabled: "totpEnabled",
        activeCondition: Studio.read.subject.activeCondition,
        encodeEnabled: (value) => value,
        decodeRequirement: requirementFor,
      },
      factor: {
        table: factorSecrets,
        scope: "scope",
        state: "state",
        version: "version",
        encodeInsert: (value) => value,
      },
      credential: {
        table: Studio.factor,
        id: "credentialId",
        subjectId: "subjectId",
        revision: "revision",
        status: "status",
        activeCondition: Studio.read.authority.activeCondition,
        encodeStatus: (active) => (active ? "active" : "removed"),
        encodeInsert: (value) => ({
          credentialId: value.credentialId,
          subjectId: value.subjectId,
          revision: value.revision,
          status: value.active ? "active" : "removed",
        }),
      },
      engineNowMillis: Studio.base.clock.engineNowMillis,
    });

    return Layer.mergeAll(
      Layer.succeed(Sessions.AuthenticationAuthority, authenticationAuthority),
      Layer.succeed(sessions.PendingAuthentication, pendingAuthentication),
      Layer.succeed(sessions.StatefulSessionPersistence, state.statefulSessionPersistence),
      Layer.succeed(sessions.SessionRepository, state.sessionRepository),
      Layer.succeed(sessions.SessionStepUpPersistence, stepUp.sessionStepUpPersistence),
      Layer.succeed(Passkey.PasskeyPersistence, persistence),
      Layer.succeed(Passkey.PasskeyCredentials, credentials.passkeyCredentials),
      Layer.succeed(Passkey.PasskeyEnrollmentContext, enrollment.passkeyEnrollmentContext),
      Layer.succeed(Passkey.PasskeyManagementPersistence, management.passkeyManagementPersistence),
      Layer.succeed(
        StudioAuth.strategies.registration.RegistrationAuthority,
        registration.passkeyRegistrationAuthority,
      ),
      Layer.succeed(Totp.TotpPersistence, totp.totpPersistence),
      Layer.succeed(StudioAuth.strategies.passkey.SessionClaims, {
        resolve: ({ subjectId }) =>
          Effect.gen(function* () {
            const [member] = yield* db
              .select()
              .from(Studio.subject)
              .where(eq(Studio.subject.id, subjectId));

            if (member === undefined) return yield* Passkey.PasskeyUnavailable.make({});

            return {
              memberId: member.id,
              organization: member.organization,
              permissions: ["design:edit"] as const,
            };
          }).pipe(Effect.mapError(() => Passkey.PasskeyUnavailable.make({}))),
      }),
    );
  }),
);

export const makeStudioLive = (binding: Operations.RequestBindingConfiguration) =>
  Layer.unwrap(
    Effect.gen(function* () {
      const db = yield* Native.Database;
      const hook = Hooks.hookContribution("studio/registration-audit");

      const hookLayer = Hooks.composeHooks(hook).pipe(
        Layer.provide(
          hook.layer({
            after: (event) =>
              event.snapshot.action === "registration"
                ? db
                    .insert(registrationEvents)
                    .values({
                      id: event.id,
                      snapshot: Schema.encodeSync(Schema.fromJsonString(Hooks.LifecycleSnapshot))(
                        event.snapshot,
                      ),
                    })
                    .onConflictDoNothing()
                    .pipe(Effect.asVoid)
                : Effect.void,
          }),
        ),
      );

      const storage = studioStorage.pipe(Layer.provide(hookLayer));

      const base = Layer.mergeAll(
        storage,
        Passkey.PasskeyConfig.layer({ profiles: [Studio.profile] }),
        hookLayer,
        WebCrypto.layerWebCrypto,
        Auth.RequestBindingConfig.layer(binding),
        TotpCrypto.layer,
      );

      const strategy = sessions.statefulLayer(sessionPolicy).pipe(Layer.provide(base));

      const completions = Layer.mergeAll(
        sessions.completionLayer({ pendingLifetimeMillis: 120000, attemptLimit: 5 }),
        sessions.stepUpLayer([
          {
            profileId: Sessions.SessionStepUpProfileId.make("management"),
            generation: 1,
            requirement,
            lifetimeMillis: 120000,
            attemptLimit: 5,
          },
        ]),
      ).pipe(Layer.provideMerge(strategy), Layer.provide(base));

      const actions = Layer.mergeAll(
        Layer.effect(
          Passkey.PasskeyActionEvidence,
          Effect.gen(function* () {
            const sessionStrategy = yield* sessions.SessionStrategy;
            const authority = yield* Sessions.AuthenticationAuthority;

            return Passkey.PasskeyActionEvidence.of({
              verify: (input) =>
                actionEvidence(
                  input.proof,
                  input.challenge.revision.subjectId,
                  input.challenge.flowId,
                  input.challenge.bindingDigest,
                ).pipe(
                  Effect.flatMap((evidence) =>
                    authority
                      .requirements(evidence)
                      .pipe(Effect.map((requirement) => ({ evidence, requirement }))),
                  ),
                  Effect.mapError(() => Passkey.PasskeyActionRequired.make({})),
                  Effect.provideService(sessions.SessionStrategy, sessionStrategy),
                ),
            });
          }),
        ),
        Layer.effect(
          Totp.TotpActionEvidence,
          Effect.map(sessions.SessionStrategy, (sessionStrategy) => ({
            verify: (input) =>
              actionEvidence(
                input.proof,
                input.challenge.revision.subjectId,
                input.challenge.flowId,
                input.challenge.bindingDigest,
              ).pipe(
                Effect.mapError(() => Totp.TotpActionRequired.make({})),
                Effect.provideService(sessions.SessionStrategy, sessionStrategy),
              ),
          })),
        ),
      );

      const modules = StudioAuth.strategies;

      const moduleServices = Layer.mergeAll(
        modules.passkey.layer,
        modules.registration.layer,
        modules.keys.layer,
        modules.authenticator.layer,
      ).pipe(
        Layer.provideMerge(
          Layer.mergeAll(
            modules.passkey.binding.layer,
            modules.registration.binding.layer,
            modules.keys.binding.layer,
          ),
        ),
        Layer.provideMerge(PasskeyProtocol.layer),
      );

      return Layer.mergeAll(
        StudioAuth.layer,
        modules.passkey.handlersLayer,
        modules.registration.handlersLayer,
        modules.keys.handlersLayer,
        modules.authenticator.handlersLayer,
        sessions.handlersLayer({ maximumAgeMillis: 120000 }),
        sessions.stepUpHandlersLayer,
      ).pipe(
        Layer.provideMerge(moduleServices),
        Layer.provideMerge(actions),
        Layer.provideMerge(completions),
        Layer.provideMerge(base),
      );
    }),
  );
