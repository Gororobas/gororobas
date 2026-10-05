import { type Context, DateTime, Effect } from "effect";

import { hasCommitScope, type PreparedCommit } from "../hooks/commit";
import { LoginIdentifier } from "../identity/models";
import type { ProofDelivery, ProofDeliveryMessage } from "./delivery";
import { ProofCapabilityUnsupported, ProofUnavailable } from "./errors";
import type { ProofDeliveryOutcome, ProofDeliveryStatus, ProofRequestReceipt } from "./models";
import type { ProofPolicy } from "./policy";
import { ProofPersistence, type ProofRecord } from "./ProofPersistence";

/** Private process-local continuation. Its closure is neither an outbox nor an RPC value. */
export interface PreparedProofDispatch<R = never> {
  readonly receipt: ProofRequestReceipt;
  /** Host admission only, after reading the committed receipt; never provider acceptance. */
  readonly schedule: Effect.Effect<void, ProofCapabilityUnsupported | ProofUnavailable, R>;
}

export interface ProofIssuePlan {
  readonly commit: Effect.Effect<
    PreparedCommit<PreparedProofDispatch>,
    ProofUnavailable | import("./errors").ProofRequestConflict
  >;
}

export const readProofCommit = <A>(receipt: PreparedCommit<A>) =>
  receipt.read.pipe(Effect.mapError(() => ProofUnavailable.make({})));

/** Call only from a prepared receipt, after its actual outer owner commits. */
export const makeProofDispatch = <DeliveryId>(
  deliveryKey: Context.Key<DeliveryId, ProofDelivery>,
  record: ProofRecord,
  message: ProofDeliveryMessage,
  policy: ProofPolicy,
): {
  readonly receipt: ProofRequestReceipt;
  readonly dispatch: Effect.Effect<
    ProofDeliveryStatus,
    ProofCapabilityUnsupported,
    ProofPersistence | DeliveryId
  >;
} => {
  message = Object.freeze({
    ...message,
    recipient: Object.freeze(LoginIdentifier.make(message.recipient)),
    reference: Object.freeze({ ...message.reference }),
  });

  return Object.freeze({
    receipt: { requestId: record.requestId, reference: message.reference },
    dispatch: Effect.uninterruptibleMask((restore) =>
      Effect.gen(function* () {
        if (yield* hasCommitScope) return yield* ProofCapabilityUnsupported.make({});
        const store = yield* ProofPersistence;
        const delivery = yield* deliveryKey;

        const claimResult = yield* store
          .claimDelivery(
            {
              moduleId: record.moduleId,
              proofId: record.proofId,
              version: record.version,
              deliveryId: record.deliveryId,
              nowMillis: DateTime.toEpochMillis(yield* DateTime.now),
              policy,
              allowAmbiguousRetry:
                policy.maximumDeliveryAttempts > 1 &&
                delivery.vendor.idempotencyMillis >= policy.lifetimeMillis,
            },
            (decision, journal) => journal.prepare(decision),
          )
          .pipe(Effect.flatMap(readProofCommit), Effect.result);

        if (claimResult._tag === "Failure") return "unavailable" as const;
        if (claimResult.success._tag === "Declined") return "not-dispatched" as const;
        const claimed = claimResult.success;
        // After a durable claim, interruption/defect is potentially delivered. Always settle.
        const sent = yield* Effect.exit(restore(Effect.suspend(() => delivery.send(message))));

        const outcome: ProofDeliveryOutcome =
          sent._tag === "Success" ? sent.value : { _tag: "Ambiguous" };

        const settled = yield* store
          .settleDelivery(
            {
              moduleId: record.moduleId,
              proofId: record.proofId,
              version: record.version,
              deliveryId: record.deliveryId,
              claimVersion: claimed.claimVersion,
              outcome,
              nowMillis: DateTime.toEpochMillis(yield* DateTime.now),
            },
            (_, journal) => journal.prepare(undefined),
          )
          .pipe(
            Effect.flatMap(readProofCommit),
            // Settlement must not turn a failed send fiber into ordinary success.
            // onExit also preserves its cause if settlement itself fails.
            Effect.onExit(() =>
              sent._tag === "Failure" ? Effect.failCause(sent.cause) : Effect.void,
            ),
            Effect.result,
          );

        if (settled._tag === "Failure") return "ambiguous" as const;

        return outcome._tag === "Accepted"
          ? ("accepted" as const)
          : outcome._tag === "DefiniteFailure"
            ? ("failed" as const)
            : ("ambiguous" as const);
      }),
    ),
  });
};
