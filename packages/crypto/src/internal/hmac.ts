import { Effect, Redacted, Schema } from "effect";

import { Hmac, Input, type Key, KeyInput, VerifyInput } from "../Hmac";
import { copy, decode, importError, nativeError, withSecret } from "./common";
import { makeScopedKey } from "./scoped-key";

const keyBytes = Schema.Uint8Array.check(Schema.isMinLength(1));

export const makeHmac = (subtle: SubtleCrypto): Hmac["Service"] => {
  const importKey = Effect.fnUntraced(function* (input: KeyInput) {
    const value = yield* decode(KeyInput, input, "key");

    yield* decode(keyBytes, Redacted.value(value.key), "key");

    const use = yield* makeScopedKey(
      withSecret(value.key, (material) =>
        Effect.tryPromise({
          try: () =>
            subtle.importKey("raw", material, { name: "HMAC", hash: value.algorithm }, false, [
              "sign",
              "verify",
            ]),
          catch: importError,
        }),
      ),
    );

    return {
      sign: Effect.fnUntraced(function* (input) {
        const data = yield* decode(Schema.Uint8Array, input, "data").pipe(Effect.flatMap(copy));

        return new Uint8Array(
          yield* use((key) =>
            Effect.tryPromise({ try: () => subtle.sign("HMAC", key, data), catch: nativeError }),
          ),
        );
      }),
      verify: Effect.fnUntraced(function* (input, signature) {
        const data = yield* decode(Schema.Uint8Array, input, "data").pipe(Effect.flatMap(copy));
        const tag = yield* decode(Schema.Uint8Array, signature, "data").pipe(Effect.flatMap(copy));

        return yield* use((key) =>
          Effect.tryPromise({
            try: () => subtle.verify("HMAC", key, tag, data),
            catch: nativeError,
          }),
        );
      }),
    } satisfies Key;
  });

  return Hmac.of({
    importKey,
    sign: Effect.fnUntraced(function* (input) {
      const value = yield* decode(Input, input, "data");
      const data = yield* copy(value.data);
      const key = yield* importKey(value);

      return yield* key.sign(data);
    }, Effect.scoped),
    verify: Effect.fnUntraced(function* (input) {
      const value = yield* decode(VerifyInput, input, "data");
      const data = yield* copy(value.data);
      const tag = yield* copy(value.tag);
      const key = yield* importKey(value);

      return yield* key.verify(data, tag);
    }, Effect.scoped),
  });
};
