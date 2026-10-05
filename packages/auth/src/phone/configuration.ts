import { snapshotProofConfiguration } from "../proofs/module";
import { defaultProofPolicy, type ProofPolicy } from "../proofs/policy";

/** Capture the phone method's proof defaults when its descriptor is constructed. */
export const snapshotPhoneConfiguration = <
  Configuration extends {
    readonly policy?: ProofPolicy;
    readonly digits?: 6 | 7 | 8 | 9 | 10;
  },
>(
  input: Configuration,
) =>
  snapshotProofConfiguration({
    ...input,
    policy: input.policy ?? defaultProofPolicy,
    secret: { _tag: "NumericCode" as const, digits: input.digits ?? 6 },
  });
