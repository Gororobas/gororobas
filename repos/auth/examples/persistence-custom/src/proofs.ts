import { Proofs } from "@yielded/auth";
import { Effect, Layer, Schema } from "effect";

import { bindingCurrent } from "./accounts";
import { AppAuth } from "./auth";
import { charge, nextId, type State } from "./model";
import { AccountStore } from "./store";

const bindingJson = Schema.encodeSync(Schema.fromJsonString(Proofs.ProofBinding));
const tuple = Schema.encodeSync(Schema.fromJsonString(Schema.Array(Schema.String)));

const sameBinding = (a: Proofs.ProofBinding, b: Proofs.ProofBinding) =>
  bindingJson(a) === bindingJson(b);

const seriesKey = (moduleId: string, purpose: string, binding: Proofs.ProofBinding) =>
  tuple([moduleId, purpose, binding.identifier.namespace, binding.identifier.value]);

const supported = (moduleId: string, purpose: string) =>
  (moduleId === `${AppAuth.strategies.password.persistence.moduleId}/reset` &&
    purpose === "password-reset") ||
  (moduleId === `${AppAuth.strategies.email.persistence.moduleId}/verify-address` &&
    purpose === "email-address-verification");

const budgets = (
  moduleId: string,
  purpose: string,
  binding: Proofs.ProofBinding,
  action: "issue" | "attempt",
  policy: Proofs.ProofPolicy,
) => {
  const key = tuple(["proof", moduleId, purpose, action]);

  return [
    {
      bucket: `${key}/action`,
      ...(action === "issue" ? policy.abuse.actionIssues : policy.abuse.actionAttempts),
    },
    {
      bucket: `${key}/${tuple([binding.identifier.namespace, binding.identifier.value])}`,
      ...(action === "issue" ? policy.abuse.issues : policy.abuse.attempts),
    },
    ...(binding._tag === "Identifier"
      ? []
      : [
          {
            bucket: `${key}/subject/${binding.revision.subjectId}`,
            ...(action === "issue" ? policy.abuse.subjectIssues : policy.abuse.subjectAttempts),
          },
        ]),
  ];
};

/** Used directly by password/email writes while holding the same store transaction. */
export const completionCurrent = (
  state: Readonly<State>,
  input: Proofs.ProofCompletionInput,
  now: number,
) => {
  if (
    !supported(input.moduleId, input.purpose) ||
    !bindingCurrent(state, input.binding, input.purpose)
  )
    return false;

  const row = state.continuations.find(
    (item) => item.moduleId === input.moduleId && item.id === input.continuationId,
  );

  const proof =
    row === undefined
      ? undefined
      : state.proofs.find(
          (item) => item.record.moduleId === input.moduleId && item.record.proofId === row.proofId,
        );

  return (
    row !== undefined &&
    proof?.state === "consumed" &&
    !row.consumed &&
    row.expiresAt > now &&
    row.purpose === input.purpose &&
    row.digest === input.continuationDigest &&
    sameBinding(row.binding, input.binding)
  );
};

export const consumeCompletion = (state: State, input: Proofs.ProofCompletionInput) => {
  state.continuations = state.continuations.map((item) =>
    item.moduleId === input.moduleId && item.id === input.continuationId
      ? { ...item, consumed: true }
      : item,
  );
};

export const ProofsLive = Layer.effect(
  Proofs.ProofPersistence,
  Effect.gen(function* () {
    const store = yield* AccountStore;

    return Proofs.ProofPersistence.of({
      issue: (input, prepare) =>
        store
          .transaction((state, journal, now) =>
            Effect.gen(function* () {
              const { record, policy } = input;

              if (!supported(record.moduleId, record.purpose))
                return yield* Proofs.ProofUnavailable.make({});

              const previous = state.proofRequests.find(
                (item) =>
                  item.moduleId === record.moduleId &&
                  item.receipt.requestId === record.requestId &&
                  item.retentionUntil > now,
              );

              if (previous !== undefined) {
                if (previous.fingerprint !== record.fingerprint)
                  return yield* Proofs.ProofRequestConflict.make({});

                return prepare({ _tag: "Existing", receipt: previous.receipt }, journal);
              }

              const receipt = {
                requestId: record.requestId,
                reference: {
                  proofId: record.proofId,
                  purpose: record.purpose,
                  keyId: record.verifier.keyId,
                },
              };

              state.proofRequests = [
                ...state.proofRequests.filter((item) => item.retentionUntil > now),
                {
                  moduleId: record.moduleId,
                  fingerprint: record.fingerprint,
                  receipt,
                  retentionUntil: now + policy.requestRetentionMillis,
                },
              ];
              const series = seriesKey(record.moduleId, record.purpose, record.binding);

              const active = state.proofs.find(
                (item) => item.series === series && item.state === "active",
              );

              const recent = state.proofs.some(
                (item) =>
                  item.series === series &&
                  item.record.issuedAtMillis > now - policy.abuse.resendCooldownMillis,
              );

              if (
                recent ||
                !input.eligible ||
                !bindingCurrent(state, record.binding, record.purpose) ||
                record.expiresAtMillis <= now ||
                record.expiresAtMillis > now + policy.lifetimeMillis ||
                state.proofs.some(
                  (item) =>
                    item.record.moduleId === record.moduleId &&
                    item.record.proofId === record.proofId,
                ) ||
                (active !== undefined &&
                  active.record.expiresAtMillis > now &&
                  !sameBinding(active.record.binding, record.binding)) ||
                (input.supersedes !== undefined && active?.record.proofId !== input.supersedes)
              )
                return prepare({ _tag: "Suppressed", receipt }, journal);

              if (
                !charge(
                  state,
                  budgets(record.moduleId, record.purpose, record.binding, "issue", policy),
                  now,
                  { requireAll: true },
                )
              )
                return prepare({ _tag: "Suppressed", receipt }, journal);

              const fresh = {
                ...record,
                issuedAtMillis: now,
                expiresAtMillis: Math.min(record.expiresAtMillis, now + policy.lifetimeMillis),
              };

              const result = prepare({ _tag: "Issued", record: fresh }, journal);

              journal.beforeCommit((time) => time >= now && time < fresh.expiresAtMillis);
              state.proofs = [
                ...state.proofs.map((item) =>
                  item.series === series && item.state === "active"
                    ? { ...item, state: "superseded" as const }
                    : item,
                ),
                {
                  record: fresh,
                  policy,
                  series,
                  state: "active",
                  retentionUntil: now + policy.requestRetentionMillis,
                  sendCount: 0,
                  deliveryState: "new",
                },
              ];

              return result;
            }),
          )
          .pipe(Effect.catchTag("StoreUnavailable", () => Proofs.ProofUnavailable.make({}))),
      attempt: (input, prepare) =>
        store
          .transaction((state, journal, now) =>
            Effect.gen(function* () {
              if (!supported(input.moduleId, input.purpose))
                return yield* Proofs.ProofUnavailable.make({});

              const row = state.proofs.find(
                (item) =>
                  item.record.moduleId === input.moduleId && item.record.proofId === input.proofId,
              );

              const policy = row?.policy ?? input.policy;
              const series = seriesKey(input.moduleId, input.purpose, input.binding);
              const failureKey = `proof-failure/${series}`;

              const failures = state.charges.filter(
                (event) =>
                  event.bucket === failureKey &&
                  event.at >= now - policy.abuse.attempts.windowMillis,
              ).length;

              const admitted = charge(
                state,
                budgets(input.moduleId, input.purpose, input.binding, "attempt", policy),
                now,
              );

              const valid =
                admitted &&
                failures < policy.maximumFailedAttempts &&
                row?.state === "active" &&
                row.record.purpose === input.purpose &&
                row.series === series &&
                row.record.expiresAtMillis > now &&
                sameBinding(row.record.binding, input.binding) &&
                bindingCurrent(state, input.binding, input.purpose) &&
                input.candidate?.keyId === row.record.verifier.keyId &&
                input.candidate.digest === row.record.verifier.digest &&
                !state.continuations.some(
                  (item) =>
                    item.moduleId === input.moduleId &&
                    (item.id === input.continuationId || item.digest === input.continuationDigest),
                );

              if (!valid || row === undefined) {
                charge(
                  state,
                  [
                    {
                      bucket: failureKey,
                      limit: policy.maximumFailedAttempts,
                      windowMillis: policy.abuse.attempts.windowMillis,
                    },
                  ],
                  now,
                );

                return prepare({ _tag: "Rejected" }, journal);
              }

              const expiresAt = Math.min(
                row.record.expiresAtMillis,
                now + policy.continuationLifetimeMillis,
              );

              const receipt = prepare(
                {
                  _tag: "Accepted",
                  continuation: {
                    continuationId: input.continuationId,
                    purpose: input.purpose,
                    expiresAtMillis: expiresAt,
                  },
                },
                journal,
              );

              journal.beforeCommit((time) => time >= now && time < expiresAt);
              state.proofs = state.proofs.map((item) =>
                item === row ? { ...item, state: "consumed" } : item,
              );
              state.continuations = [
                ...state.continuations,
                {
                  moduleId: input.moduleId,
                  purpose: input.purpose,
                  id: input.continuationId,
                  digest: input.continuationDigest,
                  proofId: input.proofId,
                  binding: input.binding,
                  expiresAt,
                  consumed: false,
                  retentionUntil: row.retentionUntil,
                },
              ];

              return receipt;
            }),
          )
          .pipe(Effect.catchTag("StoreUnavailable", () => Proofs.ProofUnavailable.make({}))),
      complete: (input, prepare) =>
        store
          .transaction((state, journal, now) =>
            Effect.sync(() => {
              const accepted = completionCurrent(state, input, now);
              const receipt = prepare(accepted ? "completed" : "rejected", journal);

              if (accepted) {
                const expiresAt =
                  state.continuations.find(
                    (row) => row.moduleId === input.moduleId && row.id === input.continuationId,
                  )?.expiresAt ?? 0;

                journal.beforeCommit((time) => time >= now && time < expiresAt);
                consumeCompletion(state, input);
              }

              return receipt;
            }),
          )
          .pipe(Effect.catchTag("StoreUnavailable", () => Proofs.ProofUnavailable.make({}))),
      claimDelivery: (input, prepare) =>
        store
          .transaction((state, journal, now) =>
            Effect.sync(() => {
              let row = state.proofs.find(
                (item) =>
                  item.record.moduleId === input.moduleId && item.record.proofId === input.proofId,
              );

              if (row === undefined) return prepare({ _tag: "Declined" }, journal);
              if (row.deliveryState === "claimed" && (row.claimDeadline ?? 0) <= now) {
                const expired = { ...row, deliveryState: "ambiguous" as const };

                state.proofs = state.proofs.map((item) => (item === row ? expired : item));
                row = expired;
              }
              if (
                row.state !== "active" ||
                row.record.expiresAtMillis <= now ||
                row.record.version !== input.version ||
                row.record.deliveryId !== input.deliveryId ||
                row.sendCount >=
                  Math.min(
                    row.policy.maximumDeliveryAttempts,
                    input.policy.maximumDeliveryAttempts,
                  ) ||
                !(
                  row.deliveryState === "new" ||
                  (row.deliveryState === "ambiguous" &&
                    input.allowAmbiguousRetry &&
                    (row.retryAt ?? 0) <= now)
                )
              )
                return prepare({ _tag: "Declined" }, journal);
              const claimVersion = Proofs.ProofVersion.make(nextId(state, "delivery"));
              const receipt = prepare({ _tag: "Claimed", claimVersion }, journal);
              const expiresAt = row.record.expiresAtMillis;

              journal.beforeCommit(
                (time) =>
                  time >= now && time < Math.min(expiresAt, now + input.policy.deliveryClaimMillis),
              );
              state.proofs = state.proofs.map((item) =>
                item === row
                  ? {
                      ...item,
                      deliveryState: "claimed",
                      claimVersion,
                      sendCount: item.sendCount + 1,
                      claimDeadline: now + item.policy.deliveryClaimMillis,
                      retryAt: now + item.policy.deliveryRetryMillis,
                    }
                  : item,
              );

              return receipt;
            }),
          )
          .pipe(Effect.catchTag("StoreUnavailable", () => Proofs.ProofUnavailable.make({}))),
      settleDelivery: (input, prepare) =>
        store
          .transaction((state, journal, now) =>
            Effect.sync(() => {
              const receipt = prepare(undefined, journal);

              state.proofs = state.proofs.map((item) =>
                item.record.moduleId === input.moduleId &&
                item.record.proofId === input.proofId &&
                item.record.version === input.version &&
                item.record.deliveryId === input.deliveryId &&
                item.claimVersion === input.claimVersion &&
                item.deliveryState === "claimed"
                  ? {
                      ...item,
                      deliveryState:
                        input.outcome._tag === "Accepted"
                          ? "accepted"
                          : input.outcome._tag === "DefiniteFailure"
                            ? "failed"
                            : "ambiguous",
                      state:
                        input.outcome._tag === "DefiniteFailure" && item.state === "active"
                          ? "cancelled"
                          : item.state,
                      retryAt: now + item.policy.deliveryRetryMillis,
                    }
                  : item,
              );

              return receipt;
            }),
          )
          .pipe(Effect.catchTag("StoreUnavailable", () => Proofs.ProofUnavailable.make({}))),
      cancel: (input, prepare) =>
        store
          .transaction((state, journal) =>
            Effect.sync(() => {
              const receipt = prepare(undefined, journal);

              if (bindingCurrent(state, input.binding, input.purpose))
                state.proofs = state.proofs.map((item) =>
                  item.record.moduleId === input.moduleId &&
                  item.record.purpose === input.purpose &&
                  sameBinding(item.record.binding, input.binding) &&
                  item.state === "active"
                    ? { ...item, state: "cancelled" }
                    : item,
                );

              return receipt;
            }),
          )
          .pipe(Effect.catchTag("StoreUnavailable", () => Proofs.ProofUnavailable.make({}))),
      cleanup: (input, prepare) =>
        store
          .transaction((state, journal, now) =>
            Effect.sync(() => {
              let removed = 0;
              let hasMore = false;

              const retain = (moduleId: string, expiresAt: number) => {
                if (moduleId !== input.moduleId || expiresAt > now) return true;
                if (removed >= input.limit) {
                  hasMore = true;

                  return true;
                }
                removed++;

                return false;
              };

              state.continuations = state.continuations.filter((row) =>
                retain(row.moduleId, row.retentionUntil),
              );
              state.proofs = state.proofs.filter((row) =>
                retain(row.record.moduleId, row.retentionUntil),
              );
              state.proofRequests = state.proofRequests.filter((row) =>
                retain(row.moduleId, row.retentionUntil),
              );

              return prepare({ removed, hasMore }, journal);
            }),
          )
          .pipe(Effect.catchTag("StoreUnavailable", () => Proofs.ProofUnavailable.make({}))),
    });
  }),
);
