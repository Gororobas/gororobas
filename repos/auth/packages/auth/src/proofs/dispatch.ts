import { Effect } from "effect";

import type { PreparedCommit } from "../hooks/commit";
import { ProofUnavailable, type ProofCapabilityUnsupported } from "./errors";
import type { ProofRequestReceipt } from "./models";

/** Private process-local delivery. Never serialize its credential-bearing closure.
 * Read only after its outer owner commits. Repeated reads share one schedule/work
 * execution; crash, queue rejection or interruption may leave a code unsent. */
export interface PreparedProofDispatch<R = never> {
  readonly receipt: ProofRequestReceipt;
  readonly schedule: Effect.Effect<void, ProofCapabilityUnsupported | ProofUnavailable, R>;
}

export interface ProofIssuePlan {
  readonly commit: Effect.Effect<PreparedCommit<PreparedProofDispatch>, ProofUnavailable>;
}

export const readProofCommit = <A>(receipt: PreparedCommit<A>) =>
  receipt.read.pipe(Effect.mapError(() => ProofUnavailable.make({})));
