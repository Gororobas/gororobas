import { Crypto, Effect } from "effect";
import { Base64Url } from "effect/encoding";

import { Unavailable } from "./models";

export const makeSecrets = Effect.gen(function* () {
  const crypto = yield* Crypto.Crypto;

  return {
    random: crypto.randomBytes(32).pipe(
      Effect.map(Base64Url.encode),
      Effect.mapError(() => Unavailable.make({})),
    ),
    digest: (value: string) =>
      crypto.digest("SHA-256", new TextEncoder().encode(value)).pipe(
        Effect.map(Base64Url.encode),
        Effect.mapError(() => Unavailable.make({})),
      ),
  };
});
