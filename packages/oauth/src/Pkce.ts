import { Crypto, Effect, Redacted } from "effect";
import { Base64Url } from "effect/encoding";

import { Unavailable } from "./Errors";
import * as V from "./internal/validation";

/** A fresh 256-bit state, nonce, or PKCE verifier; application policy owns storage. */
export const random = Effect.fnUntraced(
  function* () {
    const crypto = yield* Crypto.Crypto;
    const bytes = yield* crypto.randomBytes(32);

    if (bytes.length !== 32) return yield* Unavailable.make({});

    return Redacted.make(Base64Url.encode(bytes));
  },
  Effect.mapError(() => Unavailable.make({})),
);

export const challenge = Effect.fnUntraced(
  function* (input: Redacted.Redacted<string>) {
    const verifier = yield* V.reveal(yield* V.decode(V.Verifier, input));
    const crypto = yield* Crypto.Crypto;
    const digest = yield* crypto.digest("SHA-256", new TextEncoder().encode(verifier));

    if (digest.length !== 32) return yield* Unavailable.make({});

    return Base64Url.encode(digest);
  },
  Effect.mapError(() => Unavailable.make({})),
);

export const make = Effect.fnUntraced(function* () {
  const verifier = yield* random();

  return { verifier, challenge: yield* challenge(verifier) };
});
