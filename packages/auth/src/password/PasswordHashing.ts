import { Context, type Effect, type Redacted } from "effect";

import type {
  PasswordHashingUnavailable,
  PasswordInputInvalid,
  PasswordKdfBusy,
  PasswordVerifierInvalid,
} from "./errors";
import type { EncodedPasswordHash, PasswordVerification } from "./models";

type HashFailure = PasswordHashingUnavailable | PasswordInputInvalid | PasswordKdfBusy;

/** Byte-preserving KDF capability. Text normalization belongs to trusted credential
 * provenance, never the algorithm identifier. Rehash legacy passwords with mode none.
 * Replacements must retain admission until actual work completion, including native
 * callbacks. Portable async KDFs yield microtasks; they are not off-thread workers.
 */
export class PasswordHashing extends Context.Service<
  PasswordHashing,
  {
    readonly hash: (
      password: Redacted.Redacted<string>,
    ) => Effect.Effect<Redacted.Redacted<EncodedPasswordHash>, HashFailure>;
    readonly verify: (
      password: Redacted.Redacted<string>,
      verifier: Redacted.Redacted<EncodedPasswordHash>,
    ) => Effect.Effect<PasswordVerification, HashFailure | PasswordVerifierInvalid>;
    /** One current-cost derivation, including on the first unknown-identifier attempt. */
    readonly dummy: (password: Redacted.Redacted<string>) => Effect.Effect<void, HashFailure>;
  }
>()("effect-auth/PasswordHashing") {}
