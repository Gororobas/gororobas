import type { Algorithm } from "@yielded/crypto/Signature";

import type { AsymmetricAlgorithm } from "../Jwk";

export const algorithms = {
  ES256: "ECDSA-P256-SHA256",
  RS256: "RSASSA-PKCS1-v1_5-SHA256",
  PS256: "RSA-PSS-SHA256",
  EdDSA: "Ed25519",
} satisfies Record<AsymmetricAlgorithm, Algorithm>;
