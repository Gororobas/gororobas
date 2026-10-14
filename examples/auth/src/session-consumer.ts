import { Hooks, Schema as AuthSchema, Sessions } from "@yielded/auth";
import { DateTime, Effect, Layer, Schema } from "effect";

export const StaffClaims = Schema.Struct({
  tenant: Schema.NonEmptyString,
  staffNumber: Schema.FiniteFromString,
});

export const staffSessions = Sessions.make(StaffClaims, { namespace: "example/staff" });

export const policy: Sessions.SessionPolicy = {
  issuer: "example-auth",
  audience: "example-staff",
  generation: 1,
  idleLifetimeMillis: 60_000,
  absoluteLifetimeMillis: 300_000,
  renewalIntervalMillis: 1_000,
  maximumIssuedAbsoluteLifetimeMillis: 300_000,
  maximumTokenBytes: 4096,
  requireImmediateInvalidation: false,
};

export const subjectId = AuthSchema.SubjectId.make("staff:42");
export const initialRevision = Sessions.SecurityRevision.make("1");

export const requirement: Sessions.AuthenticationRequirement = {
  alternatives: [
    {
      factors: ["possession"],
      userVerified: false,
      phishingResistant: false,
      minimumCredentials: 1,
    },
  ],
  maximumAgeMillis: 60_000,
};

/** A disposable consumer authority for this runnable example; real adapters own durable transactions. */
export const exampleAuthority = Effect.gen(function* () {
  const hooks = yield* Hooks.LifecycleHooks;
  let revision = initialRevision;
  let sequence = 0;

  const rows = new Map<
    Sessions.SessionId,
    Sessions.StatefulSessionRecord<typeof StaffClaims.Type>
  >();

  const current = (evidence: Sessions.AuthenticationEvidence) =>
    evidence.revision.subjectId === subjectId &&
    evidence.revision.securityRevision === revision &&
    evidence.revision.credentials.every((credential) => credential.revision === revision);

  const checkEvidence = Effect.fn("Example.checkEvidence")(function* (
    evidence: Sessions.AuthenticationEvidence,
  ) {
    const now = DateTime.toEpochMillis(yield* DateTime.now);

    if (
      !current(evidence) ||
      evidence.proofs.some(
        (proof) => now - DateTime.toEpochMillis(proof.verifiedAt) >= requirement.maximumAgeMillis,
      )
    )
      return yield* Sessions.StaleAuthentication.make({});
  });

  const atomic = <A, E extends Sessions.SessionError>(
    body: (journal: Hooks.CommitJournal) => Effect.Effect<A, E>,
  ) =>
    Hooks.coordinateCommit(body).pipe(
      Effect.map((result) => result.value),
      Effect.mapError((error) =>
        error._tag === "HookConfigurationError" ? Sessions.SessionUnavailable.make({}) : error,
      ),
      Effect.provideService(Hooks.LifecycleHooks, hooks),
    );

  const authority = Layer.succeed(Sessions.AuthenticationAuthority, {
    capture: (id, credentialIds) =>
      id !== subjectId || credentialIds.some((id) => id !== "device-1")
        ? Effect.fail(Sessions.StaleAuthentication.make({}))
        : Effect.succeed({
            revision: {
              subjectId,
              securityRevision: revision,
              credentials: [{ credentialId: "device-1", revision }],
            },
            requirement,
          }),
    requirements: (evidence) => checkEvidence(evidence).pipe(Effect.as(requirement)),
    approve: (input, prepare) =>
      atomic((journal) =>
        Effect.gen(function* () {
          yield* checkEvidence(input.evidence);
          if (input.pending !== undefined) return yield* Sessions.StaleAuthentication.make({});
          if (
            DateTime.toEpochMillis(yield* DateTime.now) >= DateTime.toEpochMillis(input.expiresAt)
          )
            return yield* Sessions.StaleAuthentication.make({});

          return prepare(undefined, journal);
        }),
      ),
  });

  const store = Layer.succeed(staffSessions.StatefulSessionPersistence, {
    establish: (input, prepare) =>
      atomic((journal) =>
        Effect.gen(function* () {
          yield* checkEvidence(input.evidence);
          const now = DateTime.toEpochMillis(yield* DateTime.now);

          if (input.pending !== undefined || now >= DateTime.toEpochMillis(input.session.expiresAt))
            return yield* Sessions.StaleAuthentication.make({});

          const row = {
            ...input.session,
            sessionId: Sessions.SessionId.make(String(++sequence)),
          };

          const receipt = prepare(row, journal);

          rows.set(row.sessionId, row);

          return receipt;
        }),
      ),
    verify: (input) =>
      Effect.suspend(() => {
        const row = [...rows.values()].find((item) => item.digest === input.digest);

        return row !== undefined &&
          row.securityRevision === revision &&
          DateTime.toEpochMillis(input.now) <
            Math.min(
              DateTime.toEpochMillis(row.expiresAt),
              DateTime.toEpochMillis(row.absoluteExpiresAt),
            )
          ? Effect.succeed(row)
          : Effect.fail(Sessions.SessionInvalid.make({}));
      }),
    rotate: (input, prepare) =>
      atomic((journal) =>
        Effect.suspend(() => {
          const row = rows.get(input.record.sessionId);

          if (
            row === undefined ||
            row.subjectId !== input.record.subjectId ||
            row.digest !== input.record.digest ||
            DateTime.toEpochMillis(input.now) >= DateTime.toEpochMillis(row.expiresAt)
          )
            return Effect.fail(Sessions.SessionConflict.make({}));

          const next = {
            ...row,
            digest: input.nextDigest,
            credentialVersion: input.nextCredentialVersion,
            issuedAt: input.now,
            expiresAt: input.nextExpiresAt,
          };

          const receipt = prepare(next, journal);

          rows.set(next.sessionId, next);

          return Effect.succeed(receipt);
        }),
      ),
    revokeDigest: (digest, prepare) =>
      atomic((journal) =>
        Effect.sync(() => {
          const row = [...rows.values()].find((item) => item.digest === digest);
          const receipt = prepare(row !== undefined, journal);

          if (row !== undefined) rows.delete(row.sessionId);

          return receipt;
        }),
      ),
    revoke: (input, prepare) =>
      atomic((journal) =>
        Effect.suspend(() => {
          const receipt = prepare(undefined, journal);
          const row = rows.get(input.sessionId);

          if (row?.subjectId === input.subjectId) rows.delete(input.sessionId);

          return Effect.succeed(receipt);
        }),
      ),
    revokeAll: (input, prepare) =>
      atomic((journal) =>
        Effect.suspend(() => {
          if (input.subjectId !== subjectId || input.expectedSecurityRevision !== revision)
            return Effect.fail(Sessions.StaleAuthentication.make({}));
          const receipt = prepare(undefined, journal);

          revision = Sessions.SecurityRevision.make(String(Number(revision) + 1));
          rows.clear();

          return Effect.succeed(receipt);
        }),
      ),
  });

  const repository = Layer.succeed(staffSessions.SessionRepository, {
    list: (input) =>
      Effect.succeed({
        sessions: [...rows.values()]
          .filter((row) => row.subjectId === input.subjectId && row.securityRevision === revision)
          .slice(0, input.limit),
      }),
  });

  return Layer.mergeAll(authority, store, repository).pipe(
    Layer.provide(Hooks.LifecycleHooks.empty),
  );
});
