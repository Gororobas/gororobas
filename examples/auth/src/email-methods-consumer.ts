import {
  Auth,
  Email,
  Hooks,
  Identity,
  Proofs,
  Schema as AuthSchema,
  Sessions,
} from "@yielded/auth";
import { DateTime, Effect, Layer, Option, Schema, Redacted } from "effect";
import * as Digest from "effect/crypto/Digest";
import { Base64Url } from "effect/encoding";

import {
  cancelProof,
  cleanupProofs,
  copyProofRows,
  issueProof,
  redeemProof,
  type ProofRows,
} from "../../shared/proof-store";

export const Claims = Schema.Struct({ team: Schema.String, number: Schema.FiniteFromString });
const budget = { limit: 30, windowMillis: 60_000 };

const proofPolicy = {
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
interface State {
  subjects: Map<string, Subject>;
  identifiers: Map<string, Identifier>;
  proofs: ProofRows;
  sessions: Map<Sessions.SessionId, Sessions.StatefulSessionRecord<typeof Claims.Type>>;
}

const clone = (s: State): State => ({
  subjects: new Map([...s.subjects].map(([k, v]) => [k, { ...v }])),
  identifiers: new Map([...s.identifiers].map(([k, v]) => [k, { ...v }])),
  proofs: copyProofRows(s.proofs),
  sessions: new Map(s.sessions),
});

/** Disposable sequential copy-on-write authority for the runnable journey. No
 * production durability, distributed budgets, or consumer-owned outer API. Real
 * adapters implement the full port predicates with their physical driver owner.
 */
export const makeEmailConsumer = Effect.gen(function* () {
  const hooks = yield* Hooks.LifecycleHooks;
  const digests = yield* Digest.Digest;

  let state: State = {
    subjects: new Map(),
    identifiers: new Map(),
    proofs: new Map(),
    sessions: new Map(),
  };

  let sequence = 0;
  const consumedFactors = new Set<string>();

  const own = Effect.fnUntraced(function* <A, E>(
    body: (s: State, journal: Hooks.CommitJournal, now: number) => Effect.fn.Return<A, E>,
  ) {
    if (yield* Hooks.hasCommitScope) return yield* Email.EmailUnavailable.make({});

    return yield* Hooks.coordinateCommit((journal) =>
      Effect.gen(function* () {
        const now = DateTime.toEpochMillis(yield* DateTime.now);

        const next = yield* Effect.try({
          try: () => clone(state),
          catch: () => Email.EmailUnavailable.make({}),
        });

        const value = yield* Effect.gen(() => body(next, journal, now)).pipe(
          Effect.catchDefect(() => Effect.fail(Email.EmailUnavailable.make({}))),
        );

        state = next;

        return value;
      }),
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
    requirement: s.subjects.get(i.subjectId)?.mfa
      ? {
          ...requirement,
          alternatives: [{ ...requirement.alternatives[0], minimumCredentials: 2 }],
        }
      : requirement,
    identifier: Identity.LoginIdentifier.make({ namespace: "email", value: i.email }),
    identifierRevision: Sessions.SecurityRevision.make(i.revision),
    verifiedAtMillis: i.verifiedAt,
    credentialId: i.credentialId,
    credentialRevision: Sessions.SecurityRevision.make(i.revision),
    revision: revision(s, i.subjectId, [
      ...[...s.identifiers.values()]
        .filter((identifier) => identifier.subjectId === i.subjectId)
        .map((identifier) => identifier.credentialId),
      "fixture-factor",
    ]),
  });

  const validBinding = (s: State, b: Proofs.ProofBinding) =>
    b._tag === "Identifier" || current(s, b.revision);

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
        const r = revision(state, id, [
          ...[...state.identifiers.values()]
            .filter((identifier) => identifier.subjectId === id)
            .map((identifier) => identifier.credentialId),
          "fixture-factor",
        ]);

        return current(state, revision(state, id, ids)) && current(state, r)
          ? Effect.succeed({ revision: r, requirement: subjectRequirement(id) })
          : Effect.fail(Sessions.StaleAuthentication.make({}));
      }),
    requirements: (evidence) =>
      validate(evidence).pipe(Effect.map(() => subjectRequirement(evidence.revision.subjectId))),
    approve: (input, prepare) =>
      validate(input.evidence).pipe(
        Effect.flatMap((assessed) =>
          own(function* (s, journal, now) {
            if (
              !assessed.satisfied ||
              input.pending ||
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

  const mutate = <A>(
    action: "verify" | "change",
    input: Email.EmailAddressMutation,
    prepare: (
      decision: "changed" | "rejected",
      journal: Hooks.CommitJournal,
    ) => Hooks.PreparedCommit<A>,
  ) =>
    own(function* (s, journal, now) {
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
        (action === "verify" ||
          (source &&
            s.identifiers.get(source.identifier.value)?.credentialId === source.credentialId)) &&
        validBinding(s, input.redemption.input.binding) &&
        redeemProof(s.proofs, input.redemption.input, now) === "redeemed";

      input.redemption.prepare(valid ? "redeemed" : "rejected", journal, (v) => v);
      const result = prepare(valid ? "changed" : "rejected", journal);

      if (valid) {
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
    verifyWithProof: (input, prepare) => mutate("verify", input, prepare),
    changeWithProof: (input, prepare) => mutate("change", input, prepare),
  });

  const actions = Email.EmailActionEvidence.of({
    verify: Effect.fnUntraced(function* (input) {
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
    inspect: Effect.fn("ExampleEmail.registrationIntent")(
      function* (input) {
        const text = yield* Schema.encodeEffect(
          Schema.fromJsonString(Schema.Tuple([Schema.String, Schema.Finite])),
        )([input.registration.team, input.registration.number]);

        const digest = yield* digests.digest(Digest.sha256, new TextEncoder().encode(text));

        return {
          fingerprint: AuthSchema.TokenDigest.make(Base64Url.encode(digest)),
          eligible: !state.identifiers.has(input.identifier.value),
        };
      },
      Effect.mapError(() => Email.EmailUnavailable.make({})),
    ),
    registerWithProof: (input, prepare) =>
      own(function* (s, journal, now) {
        const valid =
          !s.identifiers.has(input.identifier.value) &&
          validBinding(s, input.redemption.input.binding) &&
          redeemProof(s.proofs, input.redemption.input, now) === "redeemed";

        input.redemption.prepare(valid ? "redeemed" : "rejected", journal, (v) => v);
        const result = prepare(valid ? { _tag: "Registered" } : { _tag: "Rejected" }, journal);

        if (valid) {
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
          own(function* (s, journal, now) {
            if (
              !assessed.satisfied ||
              input.pending ||
              !current(s, input.evidence.revision) ||
              now >= DateTime.toEpochMillis(input.session.expiresAt)
            )
              return yield* Sessions.SessionConflict.make({});

            const row = {
              ...input.session,
              sessionId: Sessions.SessionId.make(String(++sequence)),
            };

            const result = prepare(row, journal);

            s.sessions.set(row.sessionId, row);

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
      own(function* (s, journal) {
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
    requireMfaFixture: Effect.fnUntraced(function* (id: AuthSchema.SubjectId) {
      const row = state.subjects.get(id);

      if (!row) return yield* Email.EmailUnavailable.make({});
      row.mfa = true;
      row.security = String(Number(row.security) + 1);
    }),
    snapshotFixture: Effect.fnUntraced(function* (address: string) {
      const row = state.identifiers.get(address);

      if (!row) return yield* Email.EmailUnavailable.make({});

      return snapshot(state, row);
    }),
  };
});
