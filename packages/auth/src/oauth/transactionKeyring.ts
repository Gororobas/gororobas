import type { Redacted } from "effect";

export interface OAuthTransactionKeyring {
  readonly activeKeyId: string;
  readonly keys: ReadonlyArray<{
    readonly id: string;
    readonly material: Redacted.Redacted<string>;
  }>;
}
