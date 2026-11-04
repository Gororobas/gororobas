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

import {
  cancelProof,
  cleanupProofs,
  copyProofRows,
  issueProof,
  redeemProof,
  type ProofRows,
} from "../../shared/proof-store";

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
        },
      },
      reset: {
        ...Password.resetLink({ url: "https://example.invalid/reset" }),
        policy: {
          lifetimeMillis: 60_000,
          maximumFailedAttempts: 3,
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

const credentialKey = Schema.encodeSync(Schema.fromJsonString(Password.PasswordCredentialSnapshot));

interface Subject {
  id: AuthSchema.SubjectId;
  security: string;
  team: string;
  identifier: Identity.LoginIdentifier;
  password?: Password.PasswordCredentialSnapshot;
  mfa: boolean;
}
interface State {
  subjects: Map<string, Subject>;
  proofs: ProofRows;
}

const clone = (state: State): State => ({
  subjects: new Map([...state.subjects].map(([id, row]) => [id, { ...row }])),
  proofs: copyProofRows(state.proofs),
});

/** Disposable sequential process model, not a database adapter or distributed limiter.
 * All state changes are synchronous copy-on-write. Ambient owners are rejected.
 * The explicit fixtures below stand in for independent email/factor verification.
 */
export const makePasswordConsumer = Effect.gen(function* () {
  const hooks = yield* Hooks.LifecycleHooks;

  let state: State = {
    subjects: new Map(),
    proofs: new Map(),
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
        { credentialId: "example-factor", revision: Sessions.SecurityRevision.make("1") },
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

  const own = Effect.fnUntraced(function* <A, E>(
    body: (s: State, journal: Hooks.CommitJournal, now: number) => Effect.fn.Return<A, E>,
  ) {
    if (yield* Hooks.hasCommitScope) return yield* Password.PasswordUnavailable.make({});

    return yield* Hooks.coordinateCommit((journal) =>
      Effect.gen(function* () {
        const now = DateTime.toEpochMillis(yield* DateTime.now);

        const next = yield* Effect.try({
          try: () => clone(state),
          catch: () => Password.PasswordUnavailable.make({}),
        });

        const value = yield* Effect.gen(() => body(next, journal, now)).pipe(
          Effect.catchDefect(() => Effect.fail(Password.PasswordUnavailable.make({}))),
        );

        state = next;

        return value;
      }),
    ).pipe(
      Effect.map((result) => result.value),
      Effect.mapError(() => Password.PasswordUnavailable.make({})),
      Effect.provideService(Hooks.LifecycleHooks, hooks),
    );
  });

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

  const replace = Effect.fnUntraced(function* (s: State, input: Password.PasswordMutationInput) {
    const row = find(s, input.expectedRevision.subjectId);

    if (!row) return yield* Password.PasswordUnavailable.make({});
    row.security = String(Number(row.security) + 1);
    row.password = snapshot(row, input.replacement);
  });

  const store = Password.PasswordPersistence.of({
    findCredential: Effect.fnUntraced(function* (input) {
      if (yield* Hooks.hasCommitScope) return yield* Password.PasswordUnavailable.make({});
      if (input.moduleId !== "example/password")
        return yield* Password.PasswordUnavailable.make({});
      const row = state.subjects.get(input.identifier.value);

      const candidate =
        row?.identifier.namespace === input.identifier.namespace &&
        (input.subjectId === undefined || row.id === input.subjectId)
          ? row.password
          : undefined;

      return candidate === undefined
        ? Option.none()
        : Option.some(yield* Password.snapshotPasswordCredential(candidate));
    }),
    rehashIfCurrent: (input) =>
      own(function* (s, journal) {
        const row = find(s, input.credential.revision.subjectId);

        if (
          row?.password !== undefined &&
          credentialKey(row.password) === credentialKey(input.credential)
        )
          row.password = {
            ...row.password,
            verifier: input.nextVerifier,
            verifierVersion: Sessions.SecurityRevision.make(String(++sequence)),
          };

        return journal.prepare(undefined);
      }).pipe(
        Effect.flatMap((receipt) => receipt.read),
        Effect.mapError(() => Password.PasswordUnavailable.make({})),
      ),
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
      own(function* (s, journal, now) {
        const valid =
          !find(s, input.expectedRevision.subjectId)?.password && mutationAllowed(s, input, now);

        const result = prepare(valid ? "changed" : "rejected", journal);

        if (valid) yield* replace(s, input);

        return result;
      }),
    replaceIfCurrent: (input, prepare) =>
      own(function* (s, journal, now) {
        const valid =
          input.credential !== undefined &&
          find(s, input.expectedRevision.subjectId)?.password?.credentialRevision ===
            input.credential.credentialRevision &&
          mutationAllowed(s, input, now);

        const result = prepare(valid ? "changed" : "rejected", journal);

        if (valid) yield* replace(s, input);

        return result;
      }),
    resetWithProof: (input, prepare) =>
      own(function* (s, journal, now) {
        const valid =
          mutationAllowed(s, input, now) &&
          input.redemption.input.binding._tag !== "Identifier" &&
          current(s, input.redemption.input.binding.revision) &&
          redeemProof(s.proofs, input.redemption.input, now) === "redeemed";

        // BOTH preparations occur before the same copied state is published.
        input.redemption.prepare(valid ? "redeemed" : "rejected", journal, (decision) => decision);
        const result = prepare(valid ? "changed" : "rejected", journal);

        if (valid) {
          yield* replace(s, input);
        }

        return result;
      }),
  });

  const proofStore = Proofs.ProofPersistence.of({
    issue: (input, prepare) =>
      own(function* (s, journal, now) {
        return prepare(issueProof(s.proofs, input, now), journal);
      }).pipe(Effect.mapError(() => Proofs.ProofUnavailable.make({}))),
    redeem: (input, prepare) =>
      own(function* (s, journal, now) {
        return prepare(redeemProof(s.proofs, input, now), journal);
      }).pipe(Effect.mapError(() => Proofs.ProofUnavailable.make({}))),
    cancel: (input, prepare) =>
      own(function* (s, journal) {
        cancelProof(s.proofs, input);

        return prepare(undefined, journal);
      }).pipe(Effect.mapError(() => Proofs.ProofUnavailable.make({}))),
    cleanup: (input, prepare) =>
      own(function* (s, journal, now) {
        return prepare(cleanupProofs(s.proofs, input, now), journal);
      }).pipe(Effect.mapError(() => Proofs.ProofUnavailable.make({}))),
  });

  const checkEvidence = Effect.fnUntraced(function* (evidence: Sessions.AuthenticationEvidence) {
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
          credentials: [
            ...(row.password === undefined
              ? []
              : [
                  {
                    credentialId: row.password.credentialId,
                    revision: row.password.credentialRevision,
                  },
                ]),
            { credentialId: "example-factor", revision: Sessions.SecurityRevision.make("1") },
          ],
        };

        return ids.every((id) => revision.credentials.some((item) => item.credentialId === id)) &&
          current(state, revision)
          ? Effect.succeed({ revision, requirement: currentRequirement(id) })
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
          own(function* (s, journal, now) {
            if (
              !current(s, input.evidence.revision) ||
              now >= DateTime.toEpochMillis(input.expiresAt)
            )
              return yield* Sessions.StaleAuthentication.make({});

            return prepare(undefined, journal);
          }),
        ),
        Effect.mapError(() => Sessions.StaleAuthentication.make({})),
      ),
  });

  const factor = Password.PasswordActionEvidence.of({
    verify: Effect.fnUntraced(function* (input) {
      const row = find(state, input.challenge.revision.subjectId);

      if (!row || !current(state, input.challenge.revision))
        return yield* Password.PasswordActionRequired.make({});
      const proof = input.proof === undefined ? undefined : Redacted.value(input.proof);
      const useFactor = row.mfa || input.challenge.action === "add-password";

      if (
        useFactor &&
        (proof === undefined || !proof.startsWith("fixture-factor:") || consumedFactors.has(proof))
      )
        return yield* Password.PasswordActionRequired.make({});
      if (useFactor) consumedFactors.add(proof!); // Independent fixture authority. NEVER refunded by password owner.
      if (!useFactor && !input.currentPasswordEvidence && !input.recovery)
        return yield* Password.PasswordActionRequired.make({});

      const revision = input.challenge.revision;

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
      own(function* (s, journal) {
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
    verifyEmailFixture: Effect.fnUntraced(function* (email: string) {
      const row = state.subjects.get(email);

      if (!row?.password) return yield* Password.PasswordUnavailable.make({});
      row.security = String(Number(row.security) + 1);
      row.password = { ...snapshot(row, row.password), identifierVerifiedAtMillis: 1 };
    }),
    requireMfaFixture: Effect.fnUntraced(function* (email: string) {
      const row = state.subjects.get(email);

      if (!row) return yield* Password.PasswordUnavailable.make({});
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
