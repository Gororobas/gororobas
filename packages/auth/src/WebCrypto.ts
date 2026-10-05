import { Context, Crypto, Effect, Layer, PlatformError, Result } from "effect";
import { Base64 } from "effect/encoding";

/**
 * The platform's low-level WebCrypto interface, as a service so consumers
 * (session signing and proof protection) never reach
 * for `globalThis` themselves. `Crypto.Crypto` deliberately does not expose
 * `SubtleCrypto`, so this is the seam for the primitives it lacks.
 */
export class SubtleCrypto extends Context.Service<SubtleCrypto, globalThis.SubtleCrypto>()(
  "effect-auth/SubtleCrypto",
) {
  /**
   * The WebCrypto `SubtleCrypto` from the platform global. Dies when the
   * runtime has no WebCrypto — a platform gap, not a recoverable failure.
   */
  static readonly layerWeb: Layer.Layer<SubtleCrypto> = Layer.effect(SubtleCrypto)(
    Effect.suspend(() => {
      const subtle = globalThis.crypto?.subtle;

      return subtle === undefined
        ? Effect.die(new Error("WebCrypto is unavailable in this runtime"))
        : Effect.succeed(subtle);
    }),
  );
}

/** Decode a PEM body's base64 payload into its DER bytes. */
export const decodePem = (pem: string): Uint8Array | undefined =>
  Result.getOrUndefined(
    Base64.decode(
      pem
        .replace(/\\r\\n|\\n/g, "\n")
        .replace(/-----[A-Z ]+-----/g, "")
        .replace(/\s/g, ""),
    ),
  );

/**
 * `Crypto.Crypto` backed by the platform WebCrypto API. Suitable for browsers,
 * Cloudflare Workers, and Node.js 20+, all of which expose `globalThis.crypto`.
 */
export const layerCryptoWeb: Layer.Layer<Crypto.Crypto> = Layer.sync(Crypto.Crypto)(() =>
  Crypto.make({
    randomBytes: (size) => globalThis.crypto.getRandomValues(new Uint8Array(size)),
    digest: (algorithm, data) =>
      Effect.tryPromise({
        try: async () =>
          new Uint8Array(await globalThis.crypto.subtle.digest(algorithm, data as BufferSource)),
        catch: (cause) =>
          PlatformError.systemError({
            _tag: "Unknown",
            module: "Crypto",
            method: "digest",
            cause,
          }),
      }),
  }),
);

/** Complete WebCrypto adapter for auth workflows on web-compatible runtimes. */
export const layerWebCrypto = Layer.mergeAll(layerCryptoWeb, SubtleCrypto.layerWeb);
