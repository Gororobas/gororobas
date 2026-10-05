import { Context, type Effect } from "effect";

import type { TokenDigest } from "../Schema";
import type { TotpUnavailable } from "./errors";
import type { TotpSecretBinding, TotpSecretEnvelope } from "./models";

/** TOTP primitives supplied by the application. Preserve RFC 6238 SHA-1, six
 * digits and 30-second steps, and the existing AES-GCM envelope/AAD and recovery
 * digest formats when replacing an implementation. Keys remain consumer-owned. */
export class TotpCryptography extends Context.Service<
  TotpCryptography,
  {
    readonly randomId: () => string;
    readonly digest: (value: string) => TokenDigest;
    readonly recoveryDigest: (moduleId: string, subjectId: string, value: string) => TokenDigest;
    readonly generateSecret: () => Uint8Array;
    readonly matchCode: (
      secret: Uint8Array,
      code: string,
      nowMillis: number,
      skew: number,
    ) => number | null;
    readonly newRecoveryCodes: (
      moduleId: string,
      subjectId: string,
    ) => { readonly codes: Array<string>; readonly digests: Array<TokenDigest> };
    readonly encryptSecret: (
      binding: TotpSecretBinding,
      secret: Uint8Array,
    ) => Effect.Effect<TotpSecretEnvelope, TotpUnavailable>;
    readonly decryptSecret: (
      binding: TotpSecretBinding,
      envelope: TotpSecretEnvelope,
    ) => Effect.Effect<Uint8Array, TotpUnavailable>;
  }
>()("effect-auth/TotpCryptography") {}
