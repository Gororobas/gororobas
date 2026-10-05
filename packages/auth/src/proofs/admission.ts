import { Effect } from "effect";

import { HostIngressLimiter } from "./HostIngressLimiter";
import { ProofRequestContext } from "./ProofRequestContext";

/** Resolve trusted keys for every request, before target lookup or eligibility. */
export const proofRequestAdmission = Effect.fn("Proof.admitRequest")(function* (action: string) {
  const context = yield* yield* ProofRequestContext;

  return yield* (yield* HostIngressLimiter).check({
    action,
    networkKey: context.networkKey,
    ...(context.deviceKey === undefined ? {} : { deviceKey: context.deviceKey }),
  });
});
