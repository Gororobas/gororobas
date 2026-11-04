import * as Aead from "effect/crypto/Aead";
import * as Digest from "effect/crypto/Digest";
import * as Mac from "effect/crypto/Mac";
import * as SecureRandom from "effect/crypto/SecureRandom";
import * as Signature from "effect/crypto/Signature";
import * as Layer from "effect/Layer";

/** Portable crypto: secure randomness, digests, HMAC, authenticated encryption,
 * and signatures. Applications supply keys, password hashing, and HTTP separately.
 */
export const layer = Layer.mergeAll(
  Digest.layerWebCrypto,
  Mac.layerWebCrypto,
  Aead.layerWebCrypto,
  Signature.layerWebCrypto,
).pipe(Layer.provideMerge(SecureRandom.layerWebCrypto));
