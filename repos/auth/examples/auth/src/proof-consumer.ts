import { Hooks, Proofs } from "@yielded/auth";
import { DateTime, Effect, Layer } from "effect";

import {
  cancelProof,
  cleanupProofs,
  copyProofRows,
  issueProof,
  redeemProof,
  type ProofRows,
} from "../../shared/proof-store";

/** Disposable synchronous single-process authority for this example only.
 * No persistence, distributed limits, subject authority or outer transaction API. */
export const makeExampleProofAuthority = Effect.gen(function* () {
  const hooks = yield* Hooks.LifecycleHooks;
  let committed: ProofRows = new Map();

  const own = <A>(body: (rows: ProofRows, journal: Hooks.CommitJournal, now: number) => A) =>
    Effect.gen(function* () {
      if (yield* Hooks.hasCommitScope) return yield* Proofs.ProofUnavailable.make({});

      return yield* Hooks.coordinateCommit((journal) =>
        Effect.gen(function* () {
          const now = DateTime.toEpochMillis(yield* DateTime.now);

          return yield* Effect.try({
            try: () => {
              const rows = copyProofRows(committed);
              const result = body(rows, journal, now);

              committed = rows;

              return result;
            },
            catch: () => Proofs.ProofUnavailable.make({}),
          });
        }),
      ).pipe(
        Effect.map((result) => result.value),
        Effect.mapError(() => Proofs.ProofUnavailable.make({})),
        Effect.provideService(Hooks.LifecycleHooks, hooks),
      );
    });

  return Layer.succeed(
    Proofs.ProofPersistence,
    Proofs.ProofPersistence.of({
      issue: (input, prepare) =>
        own((rows, journal, now) =>
          prepare(
            issueProof(
              rows,
              { ...input, eligible: input.eligible && input.record.binding._tag === "Identifier" },
              now,
            ),
            journal,
          ),
        ),
      redeem: (input, prepare) =>
        own((rows, journal, now) => prepare(redeemProof(rows, input, now), journal)),
      cancel: (input, prepare) =>
        own((rows, journal) => {
          cancelProof(rows, input);

          return prepare(undefined, journal);
        }),
      cleanup: (input, prepare) =>
        own((rows, journal, now) => prepare(cleanupProofs(rows, input, now), journal)),
    }),
  );
});
