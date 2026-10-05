import type { Effect } from "effect";

import { HookConfigurationError, type LifecycleSnapshot } from "./models";

export type CommitMode = "interactive" | "synchronous" | "batch";

export interface AtomicContribution {
  readonly id: string;
  readonly mode: CommitMode;
  /** Static validation, before the transaction owner executes any writes. */
  readonly validate?: () => void;
}

export const validateContributions = (
  mode: CommitMode,
  contributions: ReadonlyArray<AtomicContribution>,
): void => {
  const ids = new Set<string>();

  for (const contribution of contributions) {
    if (ids.has(contribution.id))
      throw HookConfigurationError.make({
        reason: "duplicate-contribution",
        contribution: contribution.id,
      });
    ids.add(contribution.id);
    if (mode !== contribution.mode)
      throw HookConfigurationError.make({
        reason: "incompatible-transaction",
        contribution: contribution.id,
      });
    contribution.validate?.();
  }
};

export const interactiveContribution = <E, R>(
  id: string,
  run: (snapshot: LifecycleSnapshot) => Effect.Effect<void, E, R>,
) => Object.freeze({ id, mode: "interactive" as const, run });

/** The native owner executes this Effect synchronously and rolls back failures or suspension. */
export const synchronousContribution = <E, R>(
  id: string,
  run: (snapshot: LifecycleSnapshot) => Effect.Effect<void, E, R>,
) => Object.freeze({ id, mode: "synchronous" as const, run });

/** Pure statement planning only; the consumer supplies and executes the actual atomic batch. */
export const batchContribution = <Statement>(
  id: string,
  statements: (snapshot: LifecycleSnapshot) => ReadonlyArray<Statement>,
) => Object.freeze({ id, mode: "batch" as const, statements });
