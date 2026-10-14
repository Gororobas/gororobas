import { Crypto, Effect, Layer, PlatformError } from "effect";

import { Hmac } from "./Hmac";
import { makeHmac } from "./internal/hmac";
import { makeLayer } from "./internal/layer";
import { layerUnsupported } from "./internal/scrypt-backend";
import type { Limits } from "./Kdf";

/** Supply the host capability explicitly; no implicit global backend selection. */
export const layer = (subtle: SubtleCrypto, limits: Partial<Limits> = {}) =>
  makeLayer(subtle, limits).pipe(Layer.provide(layerUnsupported));

/** HMAC alone has no KDF admission requirement. */
export const layerHmac = (subtle: SubtleCrypto): Layer.Layer<Hmac> =>
  Layer.sync(Hmac)(() => makeHmac(subtle));

/** Effect entropy and SHA digests from the host's global WebCrypto implementation. */
export const layerCryptoWeb: Layer.Layer<Crypto.Crypto> = Layer.sync(Crypto.Crypto)(() =>
  Crypto.make({
    randomBytes: (size) => globalThis.crypto.getRandomValues(new Uint8Array(size)),
    digest: (algorithm, data) =>
      Effect.tryPromise({
        try: () => globalThis.crypto.subtle.digest(algorithm, new Uint8Array(data)),
        catch: (cause) =>
          PlatformError.systemError({
            _tag: "Unknown",
            module: "Crypto",
            method: "digest",
            cause,
          }),
      }).pipe(Effect.map((bytes) => new Uint8Array(bytes))),
  }),
);

/** HMAC from global WebCrypto. Missing WebCrypto is a platform defect at Layer construction. */
export const layerHmacWeb: Layer.Layer<Hmac> = Layer.effect(Hmac)(
  Effect.suspend(() => {
    const subtle = globalThis.crypto?.subtle;

    return subtle === undefined
      ? Effect.die(
          PlatformError.systemError({
            _tag: "NotFound",
            module: "Crypto",
            method: "layerHmacWeb",
            description: "WebCrypto is unavailable in this runtime",
          }),
        )
      : Effect.succeed(makeHmac(subtle));
  }),
);

/** Entropy, SHA digests and HMAC for sessions and proofs, without password derivation. */
export const layerWebCrypto = Layer.merge(layerCryptoWeb, layerHmacWeb);
