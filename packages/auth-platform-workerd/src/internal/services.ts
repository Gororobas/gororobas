import {
  KdfAdmission,
  PasswordHashing,
  type PasswordHashingConfig,
  type PasswordConfigurationError,
  type Scrypt,
} from "@yielded/auth/Password";
import * as PasswordScrypt from "@yielded/auth/PasswordScrypt";
import * as WebCrypto from "@yielded/auth/WebCrypto";
import type * as Kdf from "effect/crypto/Kdf";
import * as Layer from "effect/Layer";

import { makeArgon2 } from "./argon2-wasm";
import module from "./argon2.wasm";
import { makeLayer } from "./kdf";

/** Crypto and password services for Auth on Cloudflare Workers. Application-owned
 * HTTP, storage, keys, account policy, delivery, and protocol adapters remain separate.
 */
export type Services =
  | Layer.Success<typeof WebCrypto.layer>
  | Kdf.Kdf
  | Scrypt
  | KdfAdmission
  | PasswordHashing;

export interface Options {
  readonly passwordHashing?: PasswordHashingConfig;
  readonly kdfAdmission?: Parameters<typeof KdfAdmission.layer>[0];
}

/** Configure password costs and shared admission through preparation, derivation, and cleanup.
 */
export const layerWith = (options: Options): Layer.Layer<Services, PasswordConfigurationError> => {
  const platform = Layer.mergeAll(
    WebCrypto.layer,
    makeLayer(makeArgon2(module)),
    PasswordScrypt.layer,
    KdfAdmission.layer(options.kdfAdmission),
  );

  return PasswordHashing.layer(options.passwordHashing).pipe(Layer.provideMerge(platform));
};

/** Provide once to the application Layer. Includes entropy/digests, crypto,
 * Argon2id password hashing, and bounded KDF admission. Supply an HTTP client separately.
 * Bundle with Wrangler and enable nodejs_compat.
 *
 * Admission is shared within the built Layer's lifetime. To bound concurrent
 * requests in an isolate, retain the built services at that lifetime and supply
 * them to request-scoped auth/database Layers; rebuilding per request creates
 * independent admission services. This is not a distributed rate limiter.
 */
export const layer: Layer.Layer<Services, PasswordConfigurationError> = layerWith({});
