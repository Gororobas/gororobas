import { Crypto, Effect, Stream } from "effect";
import { Base64Url } from "effect/encoding";

import { Rejected, Unavailable } from "./models";

export const noStore = {
  "cache-control": "no-store",
  pragma: "no-cache",
  "referrer-policy": "no-referrer",
};

export const secrets = Effect.gen(function* () {
  const crypto = yield* Crypto.Crypto;

  return {
    random: crypto.randomBytes(32).pipe(
      Effect.map((bytes) => {
        const value = Base64Url.encode(bytes);

        bytes.fill(0);

        return value;
      }),
      Effect.mapError(() => Unavailable.make({})),
    ),
    digest: (value: string) =>
      crypto.digest("SHA-256", new TextEncoder().encode(value)).pipe(
        Effect.map(Base64Url.encode),
        Effect.mapError(() => Unavailable.make({})),
      ),
  };
});

export const readText = <E, R>(stream: Stream.Stream<Uint8Array, E, R>, maximum: number) =>
  Effect.gen(function* () {
    let bytes = 0;

    return yield* stream.pipe(
      Stream.mapEffect((chunk) => {
        bytes += chunk.byteLength;

        return bytes > maximum ? Effect.fail(Rejected.make({})) : Effect.succeed(chunk);
      }),
      Stream.decodeText(),
      Stream.runFold(
        () => "",
        (text, chunk) => text + chunk,
      ),
      Effect.mapError(() => Rejected.make({})),
    );
  });
