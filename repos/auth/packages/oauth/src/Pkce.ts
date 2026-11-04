import * as Cause from "effect/Cause";
import * as Digest from "effect/crypto/Digest";
import * as SecureRandom from "effect/crypto/SecureRandom";
import * as Effect from "effect/Effect";
import * as Base64Url from "effect/encoding/Base64Url";
import * as Redacted from "effect/Redacted";

import { Unavailable } from "./Errors";
import * as V from "./internal/validation";

/** A fresh 256-bit state, nonce, or PKCE verifier; application policy owns storage. */
export const random = Effect.fnUntraced(
  function* () {
    const crypto = yield* SecureRandom.SecureRandom;
    const bytes = yield* crypto.randomBytes(32);

    if (bytes.length !== 32) return yield* Unavailable.make({});

    return Redacted.make(Base64Url.encode(bytes));
  },
  Effect.catchCause((cause) => Effect.failCause(Cause.map(cause, () => Unavailable.make({})))),
);

export const challenge = Effect.fnUntraced(
  function* (input: Redacted.Redacted<string>) {
    const verifier = yield* V.reveal(yield* V.decode(V.Verifier, input));
    const digests = yield* Digest.Digest;
    const digest = yield* digests.digest(Digest.sha256, new TextEncoder().encode(verifier));

    if (digest.length !== 32) return yield* Unavailable.make({});

    return Base64Url.encode(digest);
  },
  Effect.catchCause((cause) => Effect.failCause(Cause.map(cause, () => Unavailable.make({})))),
);

export const make = Effect.fnUntraced(function* () {
  const verifier = yield* random();

  return { verifier, challenge: yield* challenge(verifier) };
});
