import { Context, type Effect, Layer, type Redacted } from "effect";

import type { PasswordHashingConfig } from "./configuration";
import type {
  PasswordHashingUnavailable,
  PasswordInputInvalid,
  PasswordKdfBusy,
  PasswordVerifierInvalid,
} from "./errors";
import { make } from "./hashing";
import type { EncodedPasswordHash, PasswordVerification } from "./models";

type HashFailure = PasswordHashingUnavailable | PasswordInputInvalid | PasswordKdfBusy;

/** Byte-preserving KDF capability. Text normalization belongs to trusted credential
 * provenance, never the algorithm identifier. Rehash legacy passwords with mode none.
 * Replacements must retain admission through computation and cleanup. KDF backends
 * own masks around nonabortable native calls until actual completion. Portable KDFs
 * can stop between batches; they are not off-thread workers.
 * Operations read secrets only when run. Erased passwords fail with
 * PasswordHashingUnavailable; erased verifiers fail with PasswordVerifierInvalid.
 * Scoped buffer ownership permits cancellation during interruptible derivation;
 * noncancelable native work must finish before its backend releases ownership.
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
>()("effect-auth/PasswordHashing") {
  /** Supply Kdf and Effect Crypto; share KdfAdmission.layer from @yielded/crypto with the KDF backend. */
  static readonly layer = (config?: PasswordHashingConfig) => Layer.effect(this, make(config));
}
