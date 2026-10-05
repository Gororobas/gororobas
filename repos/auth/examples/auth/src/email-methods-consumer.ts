import {
  Auth,
  Email,
  Hooks,
  Identity,
  Proofs,
  Schema as AuthSchema,
  Sessions,
} from "@yielded/auth";
import { Crypto, DateTime, Effect, Layer, Option, Schema, Redacted } from "effect";
import { Base64Url } from "effect/encoding";

export const Claims = Schema.Struct({ team: Schema.String, number: Schema.FiniteFromString });
const budget = { limit: 30, windowMillis: 60_000 };

const proofPolicy = {
  lifetimeMillis: 60_000,
  continuationLifetimeMillis: 30_000,
  maximumFailedAttempts: 3,
  maximumDeliveryAttempts: 1,
  deliveryClaimMillis: 5_000,
  deliveryRetryMillis: 10_000,
  requestRetentionMillis: 120_000,
  abuse: {
    issues: budget,
    attempts: budget,
    subjectIssues: budget,
    subjectAttempts: budget,
    actionIssues: budget,
    actionAttempts: budget,
    resendCooldownMillis: 0,
  },
};

const proofKeys = {
  activeKeyId: "example",
  keys: [
    {
      id: "example",
      // Demo-only key material. Production requires independently generated random keys.
      material: Redacted.make(Base64Url.encode(new Uint8Array(32).fill(24))),
    },
  ],
};

const code = { namespace: "example/email" as const, policy: proofPolicy };

export const emailAuth = Auth.make("example/email-auth", {
  claims: Claims,
  sessionNamespace: "example/email-sessions",
  defaultStrategy: "code",
  strategies: {
    code: Email.makeCode(code),
    link: Email.makeLink({
      url: "https://example.invalid/email",
      namespace: "example/email",
      policy: proofPolicy,
    }),
    registration: Email.makeRegistration({ ...code, registration: Claims }),
    addresses: Email.makeAddresses({
      ...code,
      addresses: { maximumEvidenceAgeMillis: 60_000, requireImmediateInvalidation: false },
    }),
  },
});

export const sessions = emailAuth.sessions;
export const email = emailAuth.strategies.code;
export const registration = emailAuth.strategies.registration;
export const addresses = emailAuth.strategies.addresses;

export const sessionPolicy = {
  issuer: "example",
  audience: "example",
  generation: 1,
  idleLifetimeMillis: 60_000,
  absoluteLifetimeMillis: 300_000,
  renewalIntervalMillis: 1_000,
  maximumIssuedAbsoluteLifetimeMillis: 300_000,
  maximumTokenBytes: 4096,
  requireImmediateInvalidation: false,
};

const requirement: Sessions.AuthenticationRequirement = {
  alternatives: [
    {
      factors: ["possession"],
      minimumCredentials: 1,
      userVerified: false,
      phishingResistant: false,
    },
  ],
  maximumAgeMillis: 60_000,
};

const bindingKey = Schema.encodeSync(
  Schema.fromJsonString(Schema.toCodecJson(Schema.toType(Proofs.ProofBinding))),
);

interface Subject {
  id: AuthSchema.SubjectId;
  security: string;
  team: string;
  number: number;
  mfa: boolean;
}
interface Identifier {
  subjectId: AuthSchema.SubjectId;
  email: string;
  credentialId: string;
  revision: string;
  verifiedAt: number;
}
interface Proof {
  record: Proofs.ProofRecord;
  used: boolean;
  claimed: boolean;
  failed: number;
}
interface Continuation {
  input: Proofs.ProofCompletionInput;
  expires: number;
  used: boolean;
}
interface State {
  subjects: Map<string, Subject>;
  identifiers: Map<string, Identifier>;
  proofs: Map<string, Proof>;
  continuations: Map<string, Continuation>;
  requests: Map<string, { fingerprint: string; receipt: Proofs.ProofRequestReceipt }>;
  windows: Map<string, number[]>;
  commands: Set<string>;
  sessions: Map<Sessions.SessionId, Sessions.StatefulSessionRecord<typeof Claims.Type>>;
  flows: Set<string>;
}

const clone = (s: State): State => ({
  subjects: new Map([...s.subjects].map(([k, v]) => [k, { ...v }])),
  identifiers: new Map([...s.identifiers].map(([k, v]) => [k, { ...v }])),
  proofs: new Map([...s.proofs].map(([k, v]) => [k, { ...v }])),
  continuations: new Map([...s.continuations].map(([k, v]) => [k, { ...v }])),
  requests: new Map(s.requests),
  windows: new Map([...s.windows].map(([k, v]) => [k, [...v]])),
  commands: new Set(s.commands),
  sessions: new Map(s.sessions),
  flows: new Set(s.flows),
});

/** Disposable sequential copy-on-write authority for the runnable journey. No
 * production durability, distributed budgets, or consumer-owned outer API. Real
 * adapters implement the full port predicates with their physical driver owner.
 */
export const makeEmailConsumer = Effect.gen(function* () {
  const hooks = yield* Hooks.LifecycleHooks;
  const crypto = yield* Crypto.Crypto;

  let state: State = {
    subjects: new Map(),
    identifiers: new Map(),
    proofs: new Map(),
    continuations: new Map(),
    requests: new Map(),
    windows: new Map(),
    commands: new Set(),
    sessions: new Map(),
    flows: new Set(),
  };

  let sequence = 0;
  const consumedFactors = new Set<string>();

  const own = <A>(body: (s: State, journal: Hooks.CommitJournal, now: number) => A) =>
    Effect.gen(function* () {
      if (yield* Hooks.hasCommitScope) return yield* Email.EmailUnavailable.make({});

      return yield* Hooks.coordinateCommit(
        (journal) =>
          Effect.gen(function* () {
            const now = DateTime.toEpochMillis(yield* DateTime.now);

            return yield* Effect.try({
              try: () => {
                const next = clone(state);
                const result = body(next, journal, now);

                state = next;

                return result;
              },
              catch: () => Email.EmailUnavailable.make({}),
            });
          }),
        { mode: "synchronous" },
      ).pipe(
        Effect.map((result) => result.value),
        Effect.mapError(() => Email.EmailUnavailable.make({})),
        Effect.provideService(Hooks.LifecycleHooks, hooks),
      );
    });

  const current = (s: State, r: Sessions.AuthenticationRevision) =>
    s.subjects.get(r.subjectId)?.security === r.securityRevision &&
    r.credentials.every((c) =>
      c.credentialId === "fixture-factor"
        ? c.revision === "1"
        : [...s.identifiers.values()].some(
            (i) =>
              i.subjectId === r.subjectId &&
              i.credentialId === c.credentialId &&
              i.revision === c.revision,
          ),
    );

  const revision = (
    s: State,
    subjectId: AuthSchema.SubjectId,
    ids: readonly string[],
  ): Sessions.AuthenticationRevision => ({
    subjectId,
    securityRevision: Sessions.SecurityRevision.make(
      s.subjects.get(subjectId)?.security ?? "missing",
    ),
    credentials: ids.map((credentialId) => ({
      credentialId,
      revision: Sessions.SecurityRevision.make(
        credentialId === "fixture-factor"
          ? "1"
          : ([...s.identifiers.values()].find(
              (i) => i.subjectId === subjectId && i.credentialId === credentialId,
            )?.revision ?? "missing"),
      ),
    })),
  });

  const snapshot = (s: State, i: Identifier): Email.EmailCredentialSnapshot => ({
    moduleId: "example/email",
    identifier: Identity.LoginIdentifier.make({ namespace: "email", value: i.email }),
    identifierRevision: Sessions.SecurityRevision.make(i.revision),
    verifiedAtMillis: i.verifiedAt,
    credentialId: i.credentialId,
    credentialRevision: Sessions.SecurityRevision.make(i.revision),
    revision: revision(s, i.subjectId, [i.credentialId]),
  });

  const validBinding = (s: State, b: Proofs.ProofBinding) =>
    b._tag === "Identifier" || current(s, b.revision);

  const charge = (s: State, keys: readonly string[], now: number) => {
    const buckets = keys.map((k) => {
      const v = (s.windows.get(k) ?? []).filter((t) => t > now - budget.windowMillis);

      s.windows.set(k, v);

      return v;
    });

    if (buckets.some((v) => v.length >= budget.limit)) return false;
    for (const v of buckets) v.push(now);

    return true;
  };

  const continuationValid = (s: State, i: Proofs.ProofCompletionInput, now: number) => {
    const c = s.continuations.get(i.continuationId);

    return (
      c !== undefined &&
      !c.used &&
      c.expires > now &&
      c.input.moduleId === i.moduleId &&
      c.input.purpose === i.purpose &&
      c.input.continuationDigest === i.continuationDigest &&
      bindingKey(c.input.binding) === bindingKey(i.binding) &&
      validBinding(s, i.binding)
    );
  };

  const proofStore = Proofs.ProofPersistence.of({
    issue: (input, prepare) =>
      own((s, journal, now) => {
        const r = input.record;
        const old = s.requests.get(r.requestId);

        if (old) {
          if (old.fingerprint !== r.fingerprint) throw Email.EmailUnavailable.make({});

          return prepare({ _tag: "Existing", receipt: old.receipt }, journal);
        }

        const receipt = {
          requestId: r.requestId,
          reference: { proofId: r.proofId, purpose: r.purpose, keyId: r.verifier.keyId },
        };

        const allowed =
          charge(
            s,
            [`issue:${r.moduleId}`, `issue:${r.moduleId}:${r.binding.identifier.value}`],
            now,
          ) &&
          input.eligible &&
          validBinding(s, r.binding);

        s.requests.set(r.requestId, { fingerprint: r.fingerprint, receipt });
        if (allowed) {
          for (const p of s.proofs.values())
            if (
              p.record.moduleId === r.moduleId &&
              p.record.binding.identifier.value === r.binding.identifier.value
            )
              p.used = true;
          s.proofs.set(r.proofId, { record: r, used: false, claimed: false, failed: 0 });
        }

        return prepare(
          allowed ? { _tag: "Issued", record: r } : { _tag: "Suppressed", receipt },
          journal,
        );
      }).pipe(Effect.mapError(() => Proofs.ProofUnavailable.make({}))),
    attempt: (input, prepare) =>
      own((s, journal, now) => {
        const allowed = charge(
          s,
          [
            `attempt:${input.moduleId}`,
            `attempt:${input.moduleId}:${input.binding.identifier.value}`,
          ],
          now,
        );

        const p = s.proofs.get(input.proofId);

        const valid =
          allowed &&
          p &&
          !p.used &&
          p.failed < input.policy.maximumFailedAttempts &&
          p.record.expiresAtMillis > now &&
          p.record.moduleId === input.moduleId &&
          p.record.purpose === input.purpose &&
          bindingKey(p.record.binding) === bindingKey(input.binding) &&
          validBinding(s, input.binding) &&
          p.record.verifier.keyId === input.candidate?.keyId &&
          p.record.verifier.digest === input.candidate?.digest;

        if (!valid) {
          if (p) p.failed++;

          return prepare({ _tag: "Rejected" }, journal);
        }

        const expires = Math.min(
          p.record.expiresAtMillis,
          now + input.policy.continuationLifetimeMillis,
        );

        const result = prepare(
          {
            _tag: "Accepted",
            continuation: {
              continuationId: input.continuationId,
              purpose: input.purpose,
              expiresAtMillis: expires,
            },
          },
          journal,
        );

        p.used = true;
        s.continuations.set(input.continuationId, {
          input: {
            moduleId: input.moduleId,
            purpose: input.purpose,
            binding: input.binding,
            continuationId: input.continuationId,
            continuationDigest: input.continuationDigest,
            nowMillis: now,
          },
          expires,
          used: false,
        });

        return result;
      }).pipe(Effect.mapError(() => Proofs.ProofUnavailable.make({}))),
    complete: (input, prepare) =>
      own((s, journal, now) => {
        const valid = continuationValid(s, input, now);
        const result = prepare(valid ? "completed" : "rejected", journal);

        if (valid) s.continuations.get(input.continuationId)!.used = true;

        return result;
      }).pipe(Effect.mapError(() => Proofs.ProofUnavailable.make({}))),
    claimDelivery: (input, prepare) =>
      own((s, journal, now) => {
        const p = s.proofs.get(input.proofId);

        if (
          !p ||
          p.used ||
          p.claimed ||
          p.record.expiresAtMillis <= now ||
          p.record.moduleId !== input.moduleId ||
          p.record.version !== input.version ||
          p.record.deliveryId !== input.deliveryId
        )
          return prepare({ _tag: "Declined" }, journal);
        p.claimed = true;

        return prepare({ _tag: "Claimed", claimVersion: p.record.version }, journal);
      }).pipe(Effect.mapError(() => Proofs.ProofUnavailable.make({}))),
    settleDelivery: (input, prepare) =>
      own((s, journal) => {
        const p = s.proofs.get(input.proofId);

        if (p && p.record.version === input.version && input.outcome._tag === "DefiniteFailure")
          p.used = true;

        return prepare(undefined, journal);
      }).pipe(Effect.mapError(() => Proofs.ProofUnavailable.make({}))),
    cancel: (input, prepare) =>
      own((s, journal) => {
        for (const p of s.proofs.values())
          if (
            p.record.moduleId === input.moduleId &&
            bindingKey(p.record.binding) === bindingKey(input.binding)
          )
            p.used = true;

        return prepare(undefined, journal);
      }).pipe(Effect.mapError(() => Proofs.ProofUnavailable.make({}))),
    cleanup: (input, prepare) =>
      own((s, journal, now) => {
        let removed = 0;
        let hasMore = false;

        for (const [id, p] of s.proofs)
          if (p.record.moduleId === input.moduleId && p.record.expiresAtMillis <= now) {
            if (removed < input.limit) {
              s.proofs.delete(id);
              removed++;
            } else hasMore = true;
          }

        return prepare({ removed, hasMore }, journal);
      }).pipe(Effect.mapError(() => Proofs.ProofUnavailable.make({}))),
  });

  const subjectRequirement = (id: AuthSchema.SubjectId): Sessions.AuthenticationRequirement =>
    state.subjects.get(id)?.mfa
      ? {
          ...requirement,
          alternatives: [{ ...requirement.alternatives[0], minimumCredentials: 2 }],
        }
      : requirement;

  const validate = Effect.fn("ExampleEmail.validate")(function* (
    evidence: Sessions.AuthenticationEvidence,
  ) {
    if (!current(state, evidence.revision)) return yield* Sessions.StaleAuthentication.make({});

    const assessed = yield* Sessions.assessAuthentication(
      evidence,
      subjectRequirement(evidence.revision.subjectId),
    ).pipe(Effect.mapError(() => Sessions.StaleAuthentication.make({})));

    return assessed;
  });

  const authority = Sessions.AuthenticationAuthority.of({
    capture: (id, ids) =>
      Effect.suspend(() => {
        const r = revision(state, id, ids);

        return current(state, r)
          ? Effect.succeed(r)
          : Effect.fail(Sessions.StaleAuthentication.make({}));
      }),
    requirements: (evidence) =>
      validate(evidence).pipe(Effect.map(() => subjectRequirement(evidence.revision.subjectId))),
    approve: (input, prepare) =>
      validate(input.evidence).pipe(
        Effect.flatMap((assessed) =>
          own((s, journal, now) => {
            if (
              !assessed.satisfied ||
              input.pending ||
              !current(s, input.evidence.revision) ||
              now >= DateTime.toEpochMillis(input.expiresAt)
            )
              throw Sessions.StaleAuthentication.make({});

            return prepare(undefined, journal);
          }),
        ),
        Effect.mapError(() => Sessions.StaleAuthentication.make({})),
      ),
  });

  const mutate = <A>(
    action: "verify" | "change",
    input: Email.EmailAddressMutation,
    prepare: (
      decision: "changed" | "rejected",
      journal: Hooks.CommitJournal,
    ) => Hooks.PreparedCommit<A>,
  ) =>
    own((s, journal, now) => {
      const source = action === "change" ? input.captured.source : undefined;
      const row = s.subjects.get(input.captured.revision.subjectId);

      const valid =
        row &&
        current(s, input.captured.revision) &&
        current(s, input.authorization.evidence.revision) &&
        input.authorization.evidence.proofs.some((p) => p.credentialId === "fixture-factor") &&
        input.authorization.evidence.proofs.every(
          (p) =>
            now - DateTime.toEpochMillis(p.verifiedAt) >= 0 &&
            now - DateTime.toEpochMillis(p.verifiedAt) <
              input.authorization.requirement.maximumAgeMillis,
        ) &&
        !s.identifiers.has(input.target.value) &&
        continuationValid(s, input.completion.input, now) &&
        !s.commands.has(input.commandId) &&
        (action === "verify" ||
          (source &&
            s.identifiers.get(source.identifier.value)?.credentialId === source.credentialId));

      input.completion.prepare(valid ? "completed" : "rejected", journal, (v) => v);
      const result = prepare(valid ? "changed" : "rejected", journal);

      if (valid) {
        s.commands.add(input.commandId);
        s.continuations.get(input.completion.input.continuationId)!.used = true;
        row.security = String(Number(row.security) + 1);
        if (source) s.identifiers.delete(source.identifier.value);
        s.identifiers.set(input.target.value, {
          subjectId: row.id,
          email: input.target.value,
          credentialId: source?.credentialId ?? `email:${++sequence}`,
          revision: String(Number(source?.credentialRevision ?? "0") + 1),
          verifiedAt: now,
        });
        for (const [id, session] of s.sessions)
          if (session.subjectId === row.id) s.sessions.delete(id);
      }

      return result;
    });

  const addressStore = Email.EmailAddressPersistence.of({
    target: (input) =>
      Effect.suspend(() => {
        const subject = state.subjects.get(input.subjectId);

        if (!subject) return Effect.fail(Email.EmailUnavailable.make({}));

        const source = [...state.identifiers.values()].find(
          (i) => i.subjectId === input.subjectId && i.credentialId === input.sourceCredentialId,
        );

        return Effect.succeed({
          revision: revision(state, input.subjectId, source ? [source.credentialId] : []),
          ...(source ? { source: snapshot(state, source) } : {}),
          eligible: !state.identifiers.has(input.target.value),
        });
      }),
    checkCompletion: (input) =>
      DateTime.now.pipe(
        Effect.map((now) => continuationValid(state, input, DateTime.toEpochMillis(now))),
      ),
    verifyWithProof: (input, prepare) => mutate("verify", input, prepare),
    changeWithProof: (input, prepare) => mutate("change", input, prepare),
    cleanup: (_input, prepare) =>
      own((_s, journal) => prepare({ removed: 0, hasMore: false }, journal)),
  });

  const actions = Email.EmailActionEvidence.of({
    verify: (input) =>
      Effect.gen(function* () {
        if (!current(state, input.challenge.revision) || input.proof === undefined)
          return yield* Email.EmailActionRequired.make({});
        const token = Redacted.value(input.proof);

        if (!token.startsWith("fixture:") || consumedFactors.has(token))
          return yield* Email.EmailActionRequired.make({});
        consumedFactors.add(token);

        const evidence: Sessions.AuthenticationEvidence = {
          flowId: Sessions.AuthenticationFlowId.make(input.challenge.commandId),
          bindingDigest: input.challenge.bindingDigest,
          revision: {
            ...input.challenge.revision,
            credentials: [
              ...input.challenge.revision.credentials,
              { credentialId: "fixture-factor", revision: Sessions.SecurityRevision.make("1") },
            ],
          },
          proofs: [
            {
              method: "fixture-factor",
              credentialId: "fixture-factor",
              factors: ["possession"],
              userVerified: false,
              phishingResistant: false,
              verifiedAt: yield* DateTime.now,
            },
          ],
        };

        return { evidence, requirement };
      }),
  });

  const registrations = registration.RegistrationAuthority.of({
    inspect: Effect.fn("ExampleEmail.registrationIntent")(function* (input) {
      const text = yield* Schema.encodeEffect(
        Schema.fromJsonString(Schema.Tuple([Schema.String, Schema.Finite])),
      )([input.registration.team, input.registration.number]).pipe(
        Effect.mapError(() => Email.EmailUnavailable.make({})),
      );

      const digest = yield* crypto
        .digest("SHA-256", new TextEncoder().encode(text))
        .pipe(Effect.mapError(() => Email.EmailUnavailable.make({})));

      return {
        fingerprint: AuthSchema.TokenDigest.make(Base64Url.encode(digest)),
        eligible: !state.identifiers.has(input.identifier.value),
      };
    }),
    registerWithProof: (input, prepare) =>
      own((s, journal, now) => {
        const valid =
          !s.identifiers.has(input.identifier.value) &&
          !s.commands.has(input.commandId) &&
          continuationValid(s, input.completion.input, now);

        input.completion.prepare(valid ? "completed" : "rejected", journal, (v) => v);
        const result = prepare(valid ? { _tag: "Registered" } : { _tag: "Rejected" }, journal);

        if (valid) {
          s.commands.add(input.commandId);
          s.continuations.get(input.completion.input.continuationId)!.used = true;
          const id = AuthSchema.SubjectId.make(`email-subject:${++sequence}`);

          s.subjects.set(id, {
            id,
            security: "1",
            team: input.registration.team,
            number: input.registration.number,
            mfa: false,
          });
          s.identifiers.set(input.identifier.value, {
            subjectId: id,
            email: input.identifier.value,
            credentialId: `email:${++sequence}`,
            revision: "1",
            verifiedAt: now,
          });
        }

        return result;
      }),
  });

  const stateful = sessions.StatefulSessionPersistence.of({
    establish: (input, prepare) =>
      validate(input.evidence).pipe(
        Effect.flatMap((assessed) =>
          own((s, journal, now) => {
            if (
              !assessed.satisfied ||
              input.pending ||
              s.flows.has(input.evidence.flowId) ||
              !current(s, input.evidence.revision) ||
              now >= DateTime.toEpochMillis(input.session.expiresAt)
            )
              throw Sessions.SessionConflict.make({});

            const row = {
              ...input.session,
              sessionId: Sessions.SessionId.make(String(++sequence)),
              version: Sessions.SecurityRevision.make(String(sequence)),
            };

            const result = prepare(row, journal);

            s.sessions.set(row.sessionId, row);
            s.flows.add(input.evidence.flowId);

            return result;
          }),
        ),
        Effect.mapError(() => Sessions.SessionUnavailable.make({})),
      ),
    verify: (input) =>
      Effect.suspend(() => {
        const row = [...state.sessions.values()].find((r) => r.digest === input.digest);

        return row &&
          state.subjects.get(row.subjectId)?.security === row.securityRevision &&
          DateTime.toEpochMillis(input.now) <
            Math.min(
              DateTime.toEpochMillis(row.expiresAt),
              DateTime.toEpochMillis(row.absoluteExpiresAt),
            )
          ? Effect.succeed(row)
          : Effect.fail(Sessions.SessionInvalid.make({}));
      }),
    rotate: () => Effect.fail(Sessions.SessionUnavailable.make({})),
    revokeDigest: (digest, prepare) =>
      own((s, journal) => {
        const row = [...s.sessions.values()].find((r) => r.digest === digest);
        const result = prepare(row !== undefined, journal);

        if (row) s.sessions.delete(row.sessionId);

        return result;
      }).pipe(Effect.mapError(() => Sessions.SessionUnavailable.make({}))),
    revoke: () => Effect.fail(Sessions.SessionUnavailable.make({})),
    revokeAll: () => Effect.fail(Sessions.SessionUnavailable.make({})),
  });

  return {
    layer: Layer.mergeAll(
      Layer.succeed(Proofs.ProofPersistence, proofStore),
      Proofs.ProofKeys.layer(proofKeys),
      Layer.succeed(Sessions.AuthenticationAuthority, authority),
      Layer.succeed(Email.EmailAddressPersistence, addressStore),
      Layer.succeed(Email.EmailActionEvidence, actions),
      Layer.succeed(registration.RegistrationAuthority, registrations),
      Layer.succeed(Email.EmailSignInTargets, {
        lookup: (input) =>
          Effect.sync(() => {
            const row = state.identifiers.get(input.identifier.value);

            return row ? Option.some(snapshot(state, row)) : Option.none();
          }),
      }),
      Layer.succeed(email.SessionClaims, {
        resolve: ({ subjectId }) =>
          Effect.suspend(() => {
            const row = state.subjects.get(subjectId);

            return row
              ? Effect.succeed({ team: row.team, number: row.number })
              : Effect.fail(Email.EmailUnavailable.make({}));
          }),
      }),
      Layer.succeed(sessions.StatefulSessionPersistence, stateful),
      Layer.succeed(sessions.SessionRepository, {
        list: (input) =>
          Effect.succeed({
            sessions: [...state.sessions.values()]
              .filter((row) => row.subjectId === input.subjectId)
              .slice(0, input.limit),
          }),
      }),
    ),
    requireMfaFixture: (id: AuthSchema.SubjectId) =>
      Effect.sync(() => {
        const row = state.subjects.get(id);

        if (!row) throw new Error("fixture subject missing");
        row.mfa = true;
        row.security = String(Number(row.security) + 1);
      }),
    snapshotFixture: (address: string) =>
      Effect.sync(() => {
        const row = state.identifiers.get(address);

        if (!row) throw new Error("fixture identifier missing");

        return snapshot(state, row);
      }),
  };
});
