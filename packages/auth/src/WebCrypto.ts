import { Result } from "effect";
import { Base64 } from "effect/encoding";

/** Web platform Layers live in the crypto package; these exports preserve Auth composition. */
export { layerCryptoWeb, layerWebCrypto } from "@yielded/crypto/WebCrypto";

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
