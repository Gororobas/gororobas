import type { OperationError as CryptoError } from "@yielded/crypto/Errors";
import { Schema } from "effect";

/** Fixed diagnostics never include a token, claims, key, URL, or native cause. */
export class InvalidToken extends Schema.TaggedError<InvalidToken>()("JoseInvalidToken", {
  reason: Schema.Literals(["serialization", "header", "payload", "parameters"]),
}) {}

export class AlgorithmNotAllowed extends Schema.TaggedError<AlgorithmNotAllowed>()(
  "JoseAlgorithmNotAllowed",
  {},
) {}

export class InvalidKey extends Schema.TaggedError<InvalidKey>()("JoseInvalidKey", {}) {}

export class SignatureVerificationFailed extends Schema.TaggedError<SignatureVerificationFailed>()(
  "JoseSignatureVerificationFailed",
  {},
) {}

export class DecryptionFailed extends Schema.TaggedError<DecryptionFailed>()(
  "JoseDecryptionFailed",
  {},
) {}

export class KeyNotFound extends Schema.TaggedError<KeyNotFound>()("JoseKeyNotFound", {}) {}
export class AmbiguousKey extends Schema.TaggedError<AmbiguousKey>()("JoseAmbiguousKey", {}) {}

export class JwksUnavailable extends Schema.TaggedError<JwksUnavailable>()("JoseJwksUnavailable", {
  reason: Schema.Literals(["configuration", "transport", "response", "cooldown", "busy", "closed"]),
}) {}

export class ClaimValidationFailed extends Schema.TaggedError<ClaimValidationFailed>()(
  "JoseClaimValidationFailed",
  {
    claim: Schema.Literals(["registered", "iss", "sub", "aud", "exp", "nbf", "iat", "jti", "typ"]),
    reason: Schema.Literals([
      "invalid",
      "missing",
      "mismatch",
      "expired",
      "notYetValid",
      "tooOld",
      "future",
    ]),
  },
) {}

export type KeyError = InvalidKey | KeyNotFound | AmbiguousKey | JwksUnavailable | CryptoError;

export type VerifyError =
  | KeyError
  | InvalidToken
  | AlgorithmNotAllowed
  | SignatureVerificationFailed;
