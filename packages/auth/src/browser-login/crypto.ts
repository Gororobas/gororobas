import * as Cause from "effect/Cause";
import * as Digest from "effect/crypto/Digest";
import * as SecureRandom from "effect/crypto/SecureRandom";
import * as Effect from "effect/Effect";
import * as Base64Url from "effect/encoding/Base64Url";

import { Unavailable } from "./models";

export const makeSecrets = Effect.gen(function* () {
  const crypto = yield* SecureRandom.SecureRandom;
  const digests = yield* Digest.Digest;

  return {
    random: crypto.randomBytes(32).pipe(
      Effect.map(Base64Url.encode),
      Effect.catchCause((cause) => Effect.failCause(Cause.map(cause, () => Unavailable.make({})))),
    ),
    digest: (value: string) =>
      digests.digest(Digest.sha256, new TextEncoder().encode(value)).pipe(
        Effect.map(Base64Url.encode),
        Effect.catchCause((cause) =>
          Effect.failCause(Cause.map(cause, () => Unavailable.make({}))),
        ),
      ),
  };
});
