import { Proofs } from "@yielded/auth";
import { Effect, Layer } from "effect";

import {
  cancelProof,
  cleanupProofs,
  issueProof,
  redeemProof,
  restoreProofRows,
} from "../../shared/proof-store";
import { AppAuth } from "./auth";
import type { State } from "./model";
import { AccountStore, type StoreJournal } from "./store";

const supported = (moduleId: string, purpose: string) =>
  (moduleId === `${AppAuth.strategies.password.persistence.moduleId}/reset` &&
    purpose === "password-reset") ||
  (moduleId === `${AppAuth.strategies.email.persistence.moduleId}/verify-address` &&
    purpose === "email-address-verification");

/** The same owner calls this after checking protected account authority. Final
 * checks preserve the exact consumed proof ID and its original expiry. */
export const redeemInOwner = Effect.fnUntraced(function* (
  state: State,
  input: Proofs.ProofRedemptionInput,
  now: number,
  journal: StoreJournal,
) {
  const rows = yield* restoreProofRows(state.proofs);

  const original = state.proofs.find(
    (row) => row.record.moduleId === input.moduleId && row.record.proofId === input.proofId,
  );

  const decision = redeemProof(rows, input, now);

  state.proofs = [...rows.values()];
  if (decision === "redeemed" && original !== undefined)
    journal.beforeCommit(
      (time) =>
        time >= now &&
        time < original.record.expiresAtMillis &&
        !state.proofs.some(
          (row) => row.record.moduleId === input.moduleId && row.record.proofId === input.proofId,
        ),
    );

  return decision;
});

export const ProofsLive = Layer.effect(
  Proofs.ProofPersistence,
  Effect.gen(function* () {
    const store = yield* AccountStore;

    return Proofs.ProofPersistence.of({
      issue: (input, prepare) =>
        store
          .transaction((state, journal, now) =>
            Effect.gen(function* () {
              if (!supported(input.record.moduleId, input.record.purpose))
                return yield* Proofs.ProofUnavailable.make({});
              const rows = yield* restoreProofRows(state.proofs);
              const decision = issueProof(rows, input, now);

              state.proofs = [...rows.values()];
              if (decision._tag === "Issued")
                journal.beforeCommit(
                  (time) => time >= now && time < decision.record.expiresAtMillis,
                );

              return prepare(decision, journal);
            }),
          )
          .pipe(Effect.mapError(() => Proofs.ProofUnavailable.make({}))),
      redeem: (input, prepare) =>
        store
          .transaction((state, journal, now) =>
            Effect.gen(function* () {
              if (!supported(input.moduleId, input.purpose))
                return yield* Proofs.ProofUnavailable.make({});

              return prepare(yield* redeemInOwner(state, input, now, journal), journal);
            }),
          )
          .pipe(Effect.mapError(() => Proofs.ProofUnavailable.make({}))),
      cancel: (input, prepare) =>
        store
          .transaction((state, journal) =>
            Effect.gen(function* () {
              const rows = yield* restoreProofRows(state.proofs);

              cancelProof(rows, input);
              state.proofs = [...rows.values()];

              return prepare(undefined, journal);
            }),
          )
          .pipe(Effect.mapError(() => Proofs.ProofUnavailable.make({}))),
      cleanup: (input, prepare) =>
        store
          .transaction((state, journal, now) =>
            Effect.gen(function* () {
              const rows = yield* restoreProofRows(state.proofs);
              const result = cleanupProofs(rows, input, now);

              state.proofs = [...rows.values()];

              return prepare(result, journal);
            }),
          )
          .pipe(Effect.mapError(() => Proofs.ProofUnavailable.make({}))),
    });
  }),
);
