import type { CommitJournal, PreparedCommit } from "../hooks/commit";
import type { ProofCompletionDecision } from "./models";
import type { ProofCompletionInput } from "./ProofPersistence";

/** Server-internal plan for method-specific atomic commands. Never serialize this
 * digest-bearing object. The driver consumes input and performs its protected
 * mutation under the SAME decision/transaction, then calls prepare before commit.
 * Report completed only if both continuation CAS and protected write apply; a
 * zero-row/stale protected write must reject or roll back the same authority.
 * D1 compiles conditional statements; this API does not run arbitrary callbacks
 * inside a batch. The callback only projects a precomputed decision, synchronously.
 * Keep the original action/flow binding stable. Material chosen later needs
 * separate trusted action authorization, not a rewrite of this proof binding.
 * Public context must not contain plaintext secrets or guessable secret hashes.
 */
export interface ProofCompletionPlan {
  readonly input: ProofCompletionInput;
  readonly prepare: <A>(
    decision: ProofCompletionDecision,
    journal: CommitJournal,
    project: (decision: ProofCompletionDecision) => A,
  ) => PreparedCommit<A>;
}
