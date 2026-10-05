import { Context, type Effect, type Redacted } from "effect";

import type { TotpUnavailable } from "./errors";

/** Consumer-owned AES-256 keys. Retain old key IDs until stored envelopes are replaced. */
export class TotpSecretKeys extends Context.Service<
  TotpSecretKeys,
  {
    readonly current: Effect.Effect<
      { readonly keyId: string; readonly key: Redacted.Redacted<Uint8Array> },
      TotpUnavailable
    >;
    readonly get: (keyId: string) => Effect.Effect<Redacted.Redacted<Uint8Array>, TotpUnavailable>;
  }
>()("effect-auth/TotpSecretKeys") {}
