import {
  Auth,
  Hooks,
  Identity,
  Password,
  Proofs,
  Schema as AuthSchema,
  Sessions,
} from "@yielded/auth";
import { DateTime, Effect, Layer, Option, Redacted, Schema } from "effect";

const Claims = Schema.Struct({ team: Schema.String });
const budget = { limit: 30, windowMillis: 60_000 };

export const passwordAuth = Auth.make("example/password-auth", {
  claims: Claims,
  sessionNamespace: "example/password-sessions",
  defaultStrategy: "password",
  strategies: {
    password: Password.make({
      namespace: "example/password",
      registration: Schema.Struct({ team: Schema.String }),
      policy: {
        maximumEvidenceAgeMillis: 60_000,
        requireImmediateInvalidation: false,
        attempts: {
          identifier: budget,
          subject: budget,
          action: budget,
          maximumPending: 10,
          attemptLifetimeMillis: 60_000,
        },
      },
      reset: {
        ...Password.resetLink({ url: "https://example.invalid/reset" }),
        policy: {
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
        },
      },
    }),
  },
});

export const sessions = passwordAuth.sessions;
export const passwords = passwordAuth.strategies.password;

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
      factors: ["knowledge"],
      minimumCredentials: 1,
      userVerified: false,
      phishingResistant: false,
    },
  ],
  maximumAgeMillis: 60_000,
};

const bindingCodec = Schema.fromJsonString(Schema.toCodecJson(Schema.toType(Proofs.ProofBinding)));
const bindingKey = Schema.encodeSync(bindingCodec);

interface Subject {
  id: AuthSchema.SubjectId;
  security: string;
  team: string;
  identifier: Identity.LoginIdentifier;
  password?: Password.PasswordCredentialSnapshot;
  mfa: boolean;
}
interface Proof {
  record: Proofs.ProofRecord;
  consumed: boolean;
  claimed: boolean;
}
interface Continuation {
  input: Proofs.ProofCompletionInput;
  expires: number;
  used: boolean;
}
interface State {
  registrations: Set<string>;
  subjects: Map<string, Subject>;
  attempts: Map<string, { captured?: Password.PasswordCredentialSnapshot; expires: number }>;
  windows: Map<string, number[]>;
  requests: Map<string, { fingerprint: string; receipt: Proofs.ProofRequestReceipt }>;
  proofs: Map<string, Proof>;
  continuations: Map<string, Continuation>;
}

const clone = (state: State): State => ({
  registrations: new Set(state.registrations),
  subjects: new Map([...state.subjects].map(([id, row]) => [id, { ...row }])),
  attempts: new Map(state.attempts),
  windows: new Map([...state.windows].map(([id, times]) => [id, [...times]])),
  requests: new Map(state.requests),
  proofs: new Map([...state.proofs].map(([id, row]) => [id, { ...row }])),
  continuations: new Map([...state.continuations].map(([id, row]) => [id, { ...row }])),
});

/** Disposable sequential process model, not a database adapter or distributed limiter.
 * All state changes are synchronous copy-on-write. Ambient owners are rejected.
 * The explicit fixtures below stand in for independent email/factor verification.
 */
export const makePasswordConsumer = Effect.gen(function* () {
  const hooks = yield* Hooks.LifecycleHooks;

  let state: State = {
    registrations: new Set(),
    subjects: new Map(),
    attempts: new Map(),
    windows: new Map(),
    requests: new Map(),
    proofs: new Map(),
    continuations: new Map(),
  };

  let sequence = 0;
  let failNextMutation = false;
  const consumedFactors = new Set<string>();
  const find = (s: State, id: string) => [...s.subjects.values()].find((row) => row.id === id);

  const current = (s: State, revision: Sessions.AuthenticationRevision) => {
    const row = find(s, revision.subjectId);

    return (
      row !== undefined &&
      row.security === revision.securityRevision &&
      revision.credentials.every((c) =>
        c.credentialId === "example-factor"
          ? c.revision === "1"
          : row.password?.credentialId === c.credentialId &&
            row.password.credentialRevision === c.revision,
      )
    );
  };

  const snapshot = (
    row: Subject,
    replacement: {
      verifier: Password.PasswordCredentialSnapshot["verifier"];
      normalization: Password.PasswordCredentialSnapshot["normalization"];
    },
  ): Password.PasswordCredentialSnapshot => ({
    moduleId: "example/password",
    revision: {
      subjectId: row.id,
      securityRevision: Sessions.SecurityRevision.make(row.security),
      credentials: [
        {
          credentialId: `password:${row.id}`,
          revision: Sessions.SecurityRevision.make(row.security),
        },
      ],
    },
    credentialId: `password:${row.id}`,
    credentialRevision: Sessions.SecurityRevision.make(row.security),
    verifierVersion: Sessions.SecurityRevision.make(row.security),
    verifier: replacement.verifier,
    normalization: replacement.normalization,
    identifier: row.identifier,
    identifierBindingRevision: Sessions.SecurityRevision.make(row.security),
    ...(row.password?.identifierVerifiedAtMillis === undefined
      ? {}
      : { identifierVerifiedAtMillis: row.password.identifierVerifiedAtMillis }),
  });

  const own = <A>(body: (next: State, journal: Hooks.CommitJournal, now: number) => A) =>
    Effect.gen(function* () {
      if (yield* Hooks.hasCommitScope) return yield* Password.PasswordUnavailable.make({});

      return yield* Hooks.coordinateCommit(
        (journal) =>
          Effect.gen(function* () {
            const now = DateTime.toEpochMillis(yield* DateTime.now);

            return yield* Effect.try({
              try: () => {
                const next = clone(state);
                const value = body(next, journal, now);

                state = next;

                return value;
              },
              catch: () => Password.PasswordUnavailable.make({}),
            });
          }),
        { mode: "synchronous" },
      ).pipe(
        Effect.map((result) => result.value),
        Effect.mapError(() => Password.PasswordUnavailable.make({})),
        Effect.provideService(Hooks.LifecycleHooks, hooks),
      );
    });

  const charge = (s: State, keys: readonly string[], now: number) => {
    const windows = keys.map((key) => {
      const values = (s.windows.get(key) ?? []).filter((at) => at > now - budget.windowMillis);

      s.windows.set(key, values);

      return values;
    });

    if (windows.some((values) => values.length >= budget.limit)) return false;
    for (const values of windows) values.push(now);

    return true;
  };

  const validContinuation = (s: State, input: Proofs.ProofCompletionInput, now: number) => {
    const row = s.continuations.get(input.continuationId);

    return (
      row !== undefined &&
      !row.used &&
      row.expires > now &&
      row.input.moduleId === input.moduleId &&
      row.input.purpose === input.purpose &&
      row.input.continuationDigest === input.continuationDigest &&
      bindingKey(row.input.binding) === bindingKey(input.binding) &&
      input.binding._tag !== "Identifier" &&
      current(s, input.binding.revision)
    );
  };

  const mutationAllowed = (s: State, input: Password.PasswordMutationInput, now: number) => {
    const row = find(s, input.expectedRevision.subjectId);
    const forced = failNextMutation;

    failNextMutation = false;

    return (
      !forced &&
      row !== undefined &&
      current(s, input.expectedRevision) &&
      current(s, input.authorization.evidence.revision) &&
      input.authorization.evidence.proofs.every(
        (proof) =>
          now - DateTime.toEpochMillis(proof.verifiedAt) >= 0 &&
          now - DateTime.toEpochMillis(proof.verifiedAt) <
            input.authorization.requirement.maximumAgeMillis,
      ) &&
      (!row.mfa ||
        input.authorization.evidence.proofs.some(
          (proof) => proof.credentialId === "example-factor",
        ))
    );
  };

  const replace = (s: State, input: Password.PasswordMutationInput) => {
    const row = find(s, input.expectedRevision.subjectId);

    if (!row) throw Password.PasswordUnavailable.make({});
    row.security = String(Number(row.security) + 1);
    row.password = snapshot(row, input.replacement);
  };

  const store = Password.PasswordPersistence.of({
    admitAttempt: (input, prepare) =>
      own((s, journal, now) => {
        const row = s.subjects.get(input.identifier.value);

        const allowed = charge(
          s,
          [
            `attempt:action:${input.action}`,
            `attempt:identifier:${input.identifier.value}`,
            ...(row ? [`attempt:subject:${row.id}`] : []),
          ],
          now,
        );

        if (
          !allowed ||
          [...s.attempts.values()].filter((a) => a.expires > now).length >=
            input.policy.maximumPending
        )
          return prepare({ _tag: "Denied" }, journal);
        const attemptId = Password.PasswordAttemptId.make(String(++sequence));

        const captured =
          input.subjectId === undefined || row?.id === input.subjectId ? row?.password : undefined;

        s.attempts.set(attemptId, {
          ...(captured === undefined ? {} : { captured }),
          expires: now + input.policy.attemptLifetimeMillis,
        });

        return prepare(
          { _tag: "Admitted", attemptId, ...(captured ? { credential: captured } : {}) },
          journal,
        );
      }),
    settleAttempt: (input, prepare) =>
      own((s, journal, now) => {
        const admission = s.attempts.get(input.attemptId);

        s.attempts.delete(input.attemptId);

        const valid =
          input.outcome === "verified" &&
          admission !== undefined &&
          admission.expires > now &&
          input.captured !== undefined &&
          admission.captured?.credentialId === input.captured.credentialId &&
          current(s, input.captured.revision);

        if (valid && input.rehash) {
          const row = find(s, input.captured!.revision.subjectId);

          if (
            row?.password &&
            row.password.verifierVersion === input.rehash.expectedVersion &&
            Redacted.value(row.password.verifier) === Redacted.value(input.rehash.expectedVerifier)
          )
            row.password = {
              ...row.password,
              verifier: input.rehash.nextVerifier,
              verifierVersion: Sessions.SecurityRevision.make(String(++sequence)),
            };
        }

        return prepare(valid ? "verified" : "rejected", journal);
      }),
    readForSubject: (input) =>
      Effect.sync(() => Option.fromUndefinedOr(find(state, input.subjectId)?.password)),
    recoveryTarget: (input) =>
      Effect.sync(() => {
        const value = state.subjects.get(input.identifier.value)?.password;

        return Option.fromUndefinedOr(
          value?.identifierVerifiedAtMillis === undefined ? undefined : value,
        );
      }),
    addIfAbsent: (input, prepare) =>
      own((s, journal, now) => {
        const valid =
          !find(s, input.expectedRevision.subjectId)?.password && mutationAllowed(s, input, now);

        const result = prepare(valid ? "changed" : "rejected", journal);

        if (valid) replace(s, input);

        return result;
      }),
    replaceIfCurrent: (input, prepare) =>
      own((s, journal, now) => {
        const valid =
          input.credential !== undefined &&
          find(s, input.expectedRevision.subjectId)?.password?.credentialRevision ===
            input.credential.credentialRevision &&
          mutationAllowed(s, input, now);

        const result = prepare(valid ? "changed" : "rejected", journal);

        if (valid) replace(s, input);

        return result;
      }),
    checkReset: (input) =>
      DateTime.now.pipe(
        Effect.map((now) => validContinuation(state, input, DateTime.toEpochMillis(now))),
      ),
    resetWithProof: (input, prepare) =>
      own((s, journal, now) => {
        const valid =
          validContinuation(s, input.completion.input, now) && mutationAllowed(s, input, now);

        // BOTH preparations occur before the same copied state is published.
        input.completion.prepare(valid ? "completed" : "rejected", journal, (decision) => decision);
        const result = prepare(valid ? "changed" : "rejected", journal);

        if (valid) {
          s.continuations.get(input.completion.input.continuationId)!.used = true;
          replace(s, input);
        }

        return result;
      }),
    cleanupAttempts: (input, prepare) =>
      own((s, journal, now) => {
        const expired = [...s.attempts].filter(([, row]) => row.expires <= now);

        for (const [id] of expired.slice(0, input.limit)) s.attempts.delete(id);

        return prepare(
          { removed: Math.min(expired.length, input.limit), hasMore: expired.length > input.limit },
          journal,
        );
      }),
  });

  const proofStore = Proofs.ProofPersistence.of({
    issue: (input, prepare) =>
      own((s, journal, now) => {
        const r = input.record;
        const old = s.requests.get(r.requestId);

        if (old) {
          if (old.fingerprint !== r.fingerprint) throw Proofs.ProofRequestConflict.make({});

          return prepare({ _tag: "Existing", receipt: old.receipt }, journal);
        }

        const receipt = {
          requestId: r.requestId,
          reference: { proofId: r.proofId, purpose: r.purpose, keyId: r.verifier.keyId },
        };

        const allowed =
          charge(s, ["proof:issue", `proof:issue:${r.binding.identifier.value}`], now) &&
          input.eligible &&
          r.binding._tag !== "Identifier" &&
          current(s, r.binding.revision);

        s.requests.set(r.requestId, { fingerprint: r.fingerprint, receipt });
        if (allowed) {
          for (const row of s.proofs.values())
            if (row.record.binding.identifier.value === r.binding.identifier.value)
              row.consumed = true;
          s.proofs.set(r.proofId, { record: r, consumed: false, claimed: false });
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
          ["proof:attempt", `proof:attempt:${input.binding.identifier.value}`],
          now,
        );

        const row = s.proofs.get(input.proofId);

        const valid =
          allowed &&
          row &&
          !row.consumed &&
          row.record.expiresAtMillis > now &&
          bindingKey(row.record.binding) === bindingKey(input.binding) &&
          input.binding._tag !== "Identifier" &&
          current(s, input.binding.revision) &&
          row.record.verifier.digest === input.candidate?.digest &&
          row.record.verifier.keyId === input.candidate?.keyId;

        if (!valid) return prepare({ _tag: "Rejected" }, journal);

        const expires = Math.min(
          row.record.expiresAtMillis,
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

        row.consumed = true;
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
    complete: () => Effect.fail(Proofs.ProofUnavailable.make({})), // Only the composite password owner may consume in this example.
    claimDelivery: (input, prepare) =>
      own((s, journal) => {
        const row = s.proofs.get(input.proofId);

        if (!row || row.claimed || row.consumed) return prepare({ _tag: "Declined" }, journal);
        row.claimed = true;

        return prepare({ _tag: "Claimed", claimVersion: row.record.version }, journal);
      }).pipe(Effect.mapError(() => Proofs.ProofUnavailable.make({}))),
    settleDelivery: (input, prepare) =>
      own((s, journal) => {
        const row = s.proofs.get(input.proofId);

        if (row && row.record.version === input.version && input.outcome._tag === "DefiniteFailure")
          row.consumed = true;

        return prepare(undefined, journal);
      }).pipe(Effect.mapError(() => Proofs.ProofUnavailable.make({}))),
    cancel: (input, prepare) =>
      own((s, journal) => {
        for (const row of s.proofs.values())
          if (
            row.record.moduleId === input.moduleId &&
            bindingKey(row.record.binding) === bindingKey(input.binding)
          )
            row.consumed = true;

        return prepare(undefined, journal);
      }).pipe(Effect.mapError(() => Proofs.ProofUnavailable.make({}))),
    cleanup: (input, prepare) =>
      own((s, journal, now) => {
        let removed = 0;
        let hasMore = false;

        for (const [id, row] of s.proofs)
          if (row.record.expiresAtMillis <= now) {
            if (removed < input.limit) {
              s.proofs.delete(id);
              removed++;
            } else hasMore = true;
          }
        for (const [id, row] of s.continuations)
          if (row.expires <= now) {
            if (removed < input.limit) {
              s.continuations.delete(id);
              removed++;
            } else hasMore = true;
          }

        return prepare({ removed, hasMore }, journal);
      }).pipe(Effect.mapError(() => Proofs.ProofUnavailable.make({}))),
  });

  const checkEvidence = (evidence: Sessions.AuthenticationEvidence) =>
    Effect.gen(function* () {
      if (!current(state, evidence.revision)) return yield* Sessions.StaleAuthentication.make({});

      const assessed = yield* Sessions.assessAuthentication(evidence, requirement).pipe(
        Effect.mapError(() => Sessions.StaleAuthentication.make({})),
      );

      if (!assessed.satisfied) return yield* Sessions.StaleAuthentication.make({});
    });

  const currentRequirement = (subjectId: string): Sessions.AuthenticationRequirement =>
    find(state, subjectId)?.mfa
      ? {
          ...requirement,
          alternatives: [
            {
              ...requirement.alternatives[0],
              factors: ["knowledge", "possession"],
              minimumCredentials: 2,
            },
          ],
        }
      : requirement;

  const authority = Sessions.AuthenticationAuthority.of({
    capture: (id, ids) =>
      Effect.suspend(() => {
        const row = find(state, id);

        if (!row) return Effect.fail(Sessions.StaleAuthentication.make({}));

        const revision = {
          subjectId: id,
          securityRevision: Sessions.SecurityRevision.make(row.security),
          credentials: ids.map((credentialId) => ({
            credentialId,
            revision:
              credentialId === "example-factor"
                ? Sessions.SecurityRevision.make("1")
                : (row.password?.credentialRevision ?? Sessions.SecurityRevision.make("missing")),
          })),
        };

        return current(state, revision)
          ? Effect.succeed(revision)
          : Effect.fail(Sessions.StaleAuthentication.make({}));
      }),
    requirements: (evidence) =>
      checkEvidence(evidence).pipe(
        Effect.map(() => currentRequirement(evidence.revision.subjectId)),
      ),
    approve: (input, prepare) =>
      checkEvidence(input.evidence).pipe(
        Effect.flatMap(() =>
          Sessions.assessAuthentication(
            input.evidence,
            currentRequirement(input.evidence.revision.subjectId),
          ),
        ),
        Effect.flatMap((assessed) =>
          assessed.satisfied ? Effect.void : Effect.fail(Sessions.StaleAuthentication.make({})),
        ),
        Effect.flatMap(() =>
          own((s, journal, now) => {
            if (
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

  const factor = Password.PasswordActionEvidence.of({
    verify: (input) =>
      Effect.gen(function* () {
        const row = find(state, input.challenge.revision.subjectId);

        if (!row || !current(state, input.challenge.revision))
          return yield* Password.PasswordActionRequired.make({});
        const proof = input.proof === undefined ? undefined : Redacted.value(input.proof);
        const useFactor = row.mfa || input.challenge.action === "add-password";

        if (
          useFactor &&
          (proof === undefined ||
            !proof.startsWith("fixture-factor:") ||
            consumedFactors.has(proof))
        )
          return yield* Password.PasswordActionRequired.make({});
        if (useFactor) consumedFactors.add(proof!); // Independent fixture authority. NEVER refunded by password owner.
        if (!useFactor && !input.currentPasswordEvidence && !input.recovery)
          return yield* Password.PasswordActionRequired.make({});

        const revision = {
          ...input.challenge.revision,
          credentials: [
            ...input.challenge.revision.credentials,
            ...(useFactor
              ? [{ credentialId: "example-factor", revision: Sessions.SecurityRevision.make("1") }]
              : []),
          ],
        };

        const evidence: Sessions.AuthenticationEvidence = {
          flowId: Sessions.AuthenticationFlowId.make(input.challenge.commandId),
          bindingDigest: input.challenge.bindingDigest,
          revision,
          proofs: [
            {
              method: useFactor ? "fixture-factor" : "password",
              credentialId: useFactor ? "example-factor" : revision.credentials[0]!.credentialId,
              factors: useFactor ? ["possession"] : ["knowledge"],
              userVerified: false,
              phishingResistant: false,
              verifiedAt: yield* DateTime.now,
            },
          ],
        };

        return {
          evidence,
          requirement: {
            ...requirement,
            alternatives: [
              {
                ...requirement.alternatives[0],
                factors: useFactor ? ["possession"] : ["knowledge"],
              },
            ],
          },
        };
      }),
  });

  const registration = passwords.RegistrationAuthority.of({
    register: (input, prepare) =>
      own((s, journal) => {
        if (s.registrations.has(input.requestId)) return prepare({ _tag: "Suppressed" }, journal);
        s.registrations.add(input.requestId);
        if (s.subjects.has(input.identifier.value)) return prepare({ _tag: "Suppressed" }, journal);

        const row: Subject = {
          id: AuthSchema.SubjectId.make(`example:${++sequence}`),
          security: "1",
          team: input.registration.team,
          identifier: input.identifier,
          mfa: false,
        };

        row.password = snapshot(row, input.replacement);
        const result = prepare({ _tag: "Created", subjectId: row.id }, journal);

        s.subjects.set(input.identifier.value, row);

        return result;
      }),
  });

  return {
    layer: Layer.mergeAll(
      Layer.succeed(Password.PasswordPersistence, store),
      Layer.succeed(Proofs.ProofPersistence, proofStore),
      Layer.succeed(Sessions.AuthenticationAuthority, authority),
      Layer.succeed(Password.PasswordActionEvidence, factor),
      Layer.succeed(passwords.RegistrationAuthority, registration),
      Layer.succeed(passwords.SessionClaims, {
        resolve: ({ subjectId }) =>
          Effect.suspend(() => {
            const row = find(state, subjectId);

            return row
              ? Effect.succeed({ team: row.team })
              : Effect.fail(Password.PasswordUnavailable.make({}));
          }),
      }),
    ),
    verifyEmailFixture: (email: string) =>
      Effect.sync(() => {
        const row = state.subjects.get(email);

        if (!row?.password) throw new Error("fixture subject missing");
        row.security = String(Number(row.security) + 1);
        row.password = { ...snapshot(row, row.password), identifierVerifiedAtMillis: 1 };
      }),
    requireMfaFixture: (email: string) =>
      Effect.sync(() => {
        const row = state.subjects.get(email);

        if (!row) throw new Error("fixture subject missing");
        row.mfa = true;
        row.security = String(Number(row.security) + 1);
        if (row.password) row.password = snapshot(row, row.password);
      }),
    failNextMutationFixture: Effect.sync(() => {
      failNextMutation = true;
    }),
    addSubjectFixture: (email: string) =>
      Effect.sync(() => {
        const row: Subject = {
          id: AuthSchema.SubjectId.make(`example:${++sequence}`),
          security: "1",
          team: "staff",
          identifier: Identity.LoginIdentifier.make({ namespace: "email", value: email }),
          mfa: false,
        };

        state.subjects.set(email, row);

        return row.id;
      }),
  };
});
