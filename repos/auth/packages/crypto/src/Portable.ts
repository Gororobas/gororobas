import { Layer } from "effect";

import { argon2 } from "./internal/argon2";
import { makeCryptoLayer, makeLayer } from "./internal/layer";
import { layerUnsupported } from "./internal/scrypt-backend";
import { xchacha } from "./internal/xchacha";
import type { Limits } from "./Kdf";

/** WebCrypto with owned, portable Argon2id and XChaCha20-Poly1305 implementations. */
export const layer = (subtle: SubtleCrypto, limits: Partial<Limits> = {}) =>
  makeLayer(subtle, limits, { argon2, xchacha }).pipe(Layer.provide(layerUnsupported));

/** AEAD (including XChaCha20-Poly1305), HMAC and signatures, without KDFs or admission. */
export const layerWithoutKdf = (subtle: SubtleCrypto) => makeCryptoLayer(subtle, xchacha);
