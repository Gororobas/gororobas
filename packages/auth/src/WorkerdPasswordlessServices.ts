import type { Aead } from "@yielded/crypto/Aead";
import type { Hmac } from "@yielded/crypto/Hmac";
import * as Portable from "@yielded/crypto/Portable";
import type { Signature } from "@yielded/crypto/Signature";
import { layerCryptoWeb } from "@yielded/crypto/WebCrypto";
import { type Crypto, Layer } from "effect";
import { FetchHttpClient, type HttpClient } from "effect/http";

/** Runtime services for OAuth, sessions, passkeys and proofs on Cloudflare Workers. */
export type WorkerdPasswordlessServices =
  | Crypto.Crypto
  | Aead
  | Hmac
  | Signature
  | HttpClient.HttpClient;

/** Entropy/digests, XChaCha-capable AEAD, HMAC, signatures and a Fetch HttpClient.
 * Imports no Wasm or Node built-ins and needs no nodejs_compat flag.
 * Provide to the application Layer; storage, keys, policy, delivery and protocol
 * adapters remain application-owned. Passwords use WorkerdServices instead.
 */
export const layer: Layer.Layer<WorkerdPasswordlessServices> = Layer.mergeAll(
  layerCryptoWeb,
  Portable.layerWithoutKdf(globalThis.crypto.subtle),
  FetchHttpClient.layer,
);
