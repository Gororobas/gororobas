import { Hooks, Proofs } from "@yielded/auth";
import { DateTime, Effect, Layer, Schema } from "effect";

interface Row {
  record: Proofs.ProofRecord;
  state: "active" | "consumed" | "cancelled";
  sends: number;
  delivery: "new" | "claimed" | "accepted" | "failed" | "ambiguous";
  claim: Proofs.ProofVersion;
  retryAt: number;
  claimUntil: number;
}
interface Continuation {
  readonly binding: Proofs.ProofBinding;
  readonly moduleId: string;
  readonly purpose: string;
  readonly digest: string;
  readonly expires: number;
  used: boolean;
}
interface State {
  rows: Map<string, Row>;
  requests: Map<
    string,
    { fingerprint: string; receipt: Proofs.ProofRequestReceipt; expires: number }
  >;
  active: Map<string, string>;
  windows: Map<string, number[]>;
  failures: Map<string, number[]>;
  lastIssue: Map<string, number>;
  continuations: Map<Proofs.ProofContinuationId, Continuation>;
}

const empty = (): State => ({
  rows: new Map(),
  requests: new Map(),
  active: new Map(),
  windows: new Map(),
  failures: new Map(),
  lastIssue: new Map(),
  continuations: new Map(),
});

const copy = (s: State): State => ({
  ...s,
  rows: new Map([...s.rows].map(([key, row]) => [key, { ...row }])),
  requests: new Map(s.requests),
  active: new Map(s.active),
  windows: new Map([...s.windows].map(([key, value]) => [key, [...value]])),
  failures: new Map([...s.failures].map(([key, value]) => [key, [...value]])),
  lastIssue: new Map(s.lastIssue),
  continuations: new Map([...s.continuations].map(([key, value]) => [key, { ...value }])),
});

const Key = Schema.fromJsonString(Schema.Array(Schema.String));
const key = (...parts: string[]) => Schema.encodeSync(Key)(parts);
const subject = (b: Proofs.ProofBinding) => (b._tag === "Identifier" ? "" : b.revision.subjectId);

const series = (moduleId: string, purpose: string, b: Proofs.ProofBinding) =>
  key(moduleId, purpose, b.identifier.namespace, b.identifier.value, subject(b));

const binding = (b: Proofs.ProofBinding) =>
  Schema.encodeSync(Schema.fromJsonString(Schema.toCodecJson(Schema.toType(Proofs.ProofBinding))))(
    b,
  );

const bucketKeys = (
  moduleId: string,
  purpose: string,
  b: Proofs.ProofBinding,
  policy: Proofs.ProofPolicy,
  action: "issues" | "attempts",
): ReadonlyArray<readonly [string, Proofs.ProofBudget]> => [
  [
    key(moduleId, purpose, action, "action"),
    action === "issues" ? policy.abuse.actionIssues : policy.abuse.actionAttempts,
  ],
  [
    key(moduleId, purpose, action, "identifier", b.identifier.namespace, b.identifier.value),
    policy.abuse[action],
  ],
  ...(b._tag === "Identifier"
    ? []
    : [
        [
          key(moduleId, purpose, action, "subject", subject(b)),
          action === "issues" ? policy.abuse.subjectIssues : policy.abuse.subjectAttempts,
        ] as const,
      ]),
];

const charge = (
  state: State,
  buckets: ReadonlyArray<readonly [string, Proofs.ProofBudget]>,
  now: number,
) => {
  const values = buckets.map(([key, policy]) => ({
    key,
    policy,
    events: (state.windows.get(key) ?? []).filter((at) => at > now - policy.windowMillis),
  }));

  for (const item of values) state.windows.set(item.key, item.events);
  if (values.some((item) => item.events.length >= item.policy.limit)) return false;
  for (const item of values) item.events.push(now);

  return true;
};

/** Disposable synchronous single-process authority for this example only.
 * No persistence, distributed limits, subject-revision authority, or outer transaction API.
 */
export const makeExampleProofAuthority = Effect.gen(function* () {
  const hooks = yield* Hooks.LifecycleHooks;
  let committed = empty();

  const own = <A>(body: (state: State, journal: Hooks.CommitJournal, now: number) => A) =>
    Effect.gen(function* () {
      if (yield* Hooks.hasCommitScope) return yield* Proofs.ProofUnavailable.make({});

      return yield* Hooks.coordinateCommit(
        (journal) =>
          Effect.gen(function* () {
            const now = DateTime.toEpochMillis(yield* DateTime.now);

            return yield* Effect.try({
              try: () => {
                const state = copy(committed);
                const value = body(state, journal, now);

                committed = state;

                return value;
              },
              catch: (error) =>
                Schema.is(Proofs.ProofRequestConflict)(error)
                  ? error
                  : Proofs.ProofUnavailable.make({}),
            });
          }),
        { mode: "synchronous" },
      ).pipe(
        Effect.map((result) => result.value),
        Effect.mapError((error) =>
          Schema.is(Proofs.ProofRequestConflict)(error) ? error : Proofs.ProofUnavailable.make({}),
        ),
        Effect.provideService(Hooks.LifecycleHooks, hooks),
      );
    });

  const available = <A>(
    effect: Effect.Effect<A, Proofs.ProofRequestConflict | Proofs.ProofUnavailable>,
  ) => effect.pipe(Effect.mapError(() => Proofs.ProofUnavailable.make({})));

  const store = Proofs.ProofPersistence.of({
    issue: (input, prepare) =>
      own((state, journal, now) => {
        const r = input.record;
        const requestKey = key(r.moduleId, r.requestId);
        const previous = state.requests.get(requestKey);

        if (previous && previous.expires > now) {
          if (previous.fingerprint !== r.fingerprint) throw Proofs.ProofRequestConflict.make({});

          return prepare({ _tag: "Existing", receipt: previous.receipt }, journal);
        }

        const receipt = {
          requestId: r.requestId,
          reference: { proofId: r.proofId, purpose: r.purpose, keyId: r.verifier.keyId },
        };

        const scope = series(r.moduleId, r.purpose, r.binding);

        const admitted = charge(
          state,
          bucketKeys(r.moduleId, r.purpose, r.binding, input.policy, "issues"),
          now,
        );

        const allowed =
          admitted &&
          input.eligible &&
          r.binding._tag === "Identifier" &&
          r.issuedAtMillis <= now &&
          r.expiresAtMillis > now &&
          now - (state.lastIssue.get(scope) ?? -Infinity) >=
            input.policy.abuse.resendCooldownMillis &&
          (!input.supersedes || state.active.get(scope) === input.supersedes);

        const result = prepare(
          allowed ? { _tag: "Issued", record: r } : { _tag: "Suppressed", receipt },
          journal,
        );

        state.requests.set(requestKey, {
          fingerprint: r.fingerprint,
          receipt,
          expires: now + input.policy.requestRetentionMillis,
        });
        if (allowed) {
          const old = state.rows.get(state.active.get(scope) ?? "");

          if (old) old.state = "cancelled";
          state.rows.set(r.proofId, {
            record: r,
            state: "active",
            sends: 0,
            delivery: "new",
            claim: r.version,
            retryAt: 0,
            claimUntil: 0,
          });
          state.active.set(scope, r.proofId);
          state.lastIssue.set(scope, now);
        }

        return result;
      }),
    attempt: (input, prepare) =>
      available(
        own((state, journal, now) => {
          const scope = series(input.moduleId, input.purpose, input.binding);

          const failures = (state.failures.get(scope) ?? []).filter(
            (at) => at > now - input.policy.abuse.attempts.windowMillis,
          );

          state.failures.set(scope, failures);

          const admitted = charge(
            state,
            bucketKeys(input.moduleId, input.purpose, input.binding, input.policy, "attempts"),
            now,
          );

          const row = state.rows.get(input.proofId);

          const valid =
            admitted &&
            failures.length < input.policy.maximumFailedAttempts &&
            row?.state === "active" &&
            row.record.moduleId === input.moduleId &&
            row.record.purpose === input.purpose &&
            binding(row.record.binding) === binding(input.binding) &&
            row.record.expiresAtMillis > now &&
            state.active.get(scope) === input.proofId &&
            input.candidate?.keyId === row.record.verifier.keyId &&
            input.candidate?.digest === row.record.verifier.digest;

          if (!valid) {
            const result = prepare({ _tag: "Rejected" }, journal);

            if (admitted) failures.push(now);

            return result;
          }

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

          row.state = "consumed";
          state.continuations.set(input.continuationId, {
            binding: input.binding,
            moduleId: input.moduleId,
            purpose: input.purpose,
            digest: input.continuationDigest,
            expires,
            used: false,
          });

          return result;
        }),
      ),
    complete: (input, prepare) =>
      available(
        own((state, journal, now) => {
          const row = state.continuations.get(input.continuationId);

          const valid =
            row &&
            !row.used &&
            row.expires > now &&
            row.moduleId === input.moduleId &&
            row.purpose === input.purpose &&
            row.digest === input.continuationDigest &&
            binding(row.binding) === binding(input.binding);

          const result = prepare(valid ? "completed" : "rejected", journal);

          if (valid) row.used = true;

          return result;
        }),
      ),
    claimDelivery: (input, prepare) =>
      available(
        own((state, journal, now) => {
          const row = state.rows.get(input.proofId);

          if (row?.delivery === "claimed" && row.claimUntil <= now) row.delivery = "ambiguous";

          const valid =
            row &&
            row.state === "active" &&
            row.record.moduleId === input.moduleId &&
            row.record.version === input.version &&
            row.record.deliveryId === input.deliveryId &&
            row.record.expiresAtMillis > now &&
            row.sends < input.policy.maximumDeliveryAttempts &&
            now >= row.retryAt &&
            (row.delivery === "new" || (row.delivery === "ambiguous" && input.allowAmbiguousRetry));

          if (!valid) return prepare({ _tag: "Declined" }, journal);
          const claimVersion = Proofs.ProofVersion.make(String(row.sends + 1));
          const result = prepare({ _tag: "Claimed", claimVersion }, journal);

          row.claim = claimVersion;
          row.sends++;
          row.delivery = "claimed";
          row.claimUntil = now + input.policy.deliveryClaimMillis;
          row.retryAt = now + input.policy.deliveryRetryMillis;

          return result;
        }),
      ),
    settleDelivery: (input, prepare) =>
      available(
        own((state, journal) => {
          const row = state.rows.get(input.proofId);
          const result = prepare(undefined, journal);

          if (
            row &&
            row.record.moduleId === input.moduleId &&
            row.record.version === input.version &&
            row.record.deliveryId === input.deliveryId &&
            row.claim === input.claimVersion
          ) {
            row.delivery =
              input.outcome._tag === "Accepted"
                ? "accepted"
                : input.outcome._tag === "DefiniteFailure"
                  ? "failed"
                  : "ambiguous";
            if (row.delivery === "failed") row.state = "cancelled";
          }

          return result;
        }),
      ),
    cancel: (input, prepare) =>
      available(
        own((state, journal) => {
          const result = prepare(undefined, journal);

          const row = state.rows.get(
            state.active.get(series(input.moduleId, input.purpose, input.binding)) ?? "",
          );

          if (row) row.state = "cancelled";

          return result;
        }),
      ),
    cleanup: (input, prepare) =>
      available(
        own((state, journal, now) => {
          let removed = 0;
          let hasMore = false;

          for (const [id, row] of state.rows)
            if (row.record.moduleId === input.moduleId && row.record.expiresAtMillis <= now) {
              if (removed < input.limit) {
                state.rows.delete(id);
                removed++;
              } else hasMore = true;
            }
          for (const [id, row] of state.continuations)
            if (row.moduleId === input.moduleId && row.expires <= now) {
              if (removed < input.limit) {
                state.continuations.delete(id);
                removed++;
              } else hasMore = true;
            }

          // Retain independent window/fingerprint horizons; this disposable example
          // intentionally retains their metadata until the process exits.
          return prepare({ removed, hasMore }, journal);
        }),
      ),
  });

  return Layer.succeed(Proofs.ProofPersistence, store);
});
