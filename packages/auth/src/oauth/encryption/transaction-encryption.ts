import { Effect, Redacted, type Schema, type Scope } from "effect";

import { OAuthUnavailable } from "../signInErrors";
import { OAuthSealedTransaction, type OAuthTransactionSecrets } from "../signInModels";
import type { OAuthTransactionKeyring } from "../transactionKeyring";
import { decodeBase64, payloadEncryption } from "./payload";

export const transactionEncryption = <
  C extends { readonly protocol: "oidc" | "oauth" },
  S extends OAuthTransactionSecrets,
>(
  context: Schema.Codec<C, unknown, never, never>,
  aad: (context: C, keyId: string) => Effect.Effect<Uint8Array, OAuthUnavailable, Scope.Scope>,
  keyring: OAuthTransactionKeyring,
  plaintext: Schema.Codec<S, unknown, never, never>,
  envelope: {
    readonly schema: Schema.Codec<OAuthSealedTransaction, unknown, never, never>;
    readonly maximumPlaintextBytes: number;
  } = { schema: OAuthSealedTransaction, maximumPlaintextBytes: 16384 },
) =>
  payloadEncryption(
    {
      context,
      aad,
      plaintext,
      envelope: envelope.schema,
      format: "oauth-xchacha20poly1305-v1",
      maximumPlaintextBytes: envelope.maximumPlaintextBytes,
      validate: Effect.fnUntraced(function* (context: C, secrets: S) {
        if ((context.protocol === "oidc") !== (secrets.oidcNonce !== undefined))
          return yield* OAuthUnavailable.make({});
        for (const raw of [secrets.state, secrets.oidcNonce])
          if (raw !== undefined) {
            const value = yield* Effect.try({
              try: () => Redacted.value(raw),
              catch: () => OAuthUnavailable.make({}),
            });

            yield* decodeBase64(value, 32, 32);
          }

        return secrets;
      }),
    },
    keyring,
  ).pipe(
    Effect.map((encryption) => ({
      seal: (input: { readonly context: C; readonly secrets: S }) =>
        encryption.seal(input.context, input.secrets),
      open: (input: { readonly context: C; readonly sealed: OAuthSealedTransaction }) =>
        encryption.open(input.context, input.sealed),
    })),
  );
