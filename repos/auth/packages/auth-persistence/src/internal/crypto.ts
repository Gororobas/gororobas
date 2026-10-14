import { TokenDigest } from "@yielded/auth/Schema";
import { Crypto, Effect } from "effect";
import { Base64Url } from "effect/encoding";

const encoder = new TextEncoder();

export const randomId = Effect.flatMap(Crypto.Crypto, (crypto) =>
  crypto.randomBytes(32).pipe(Effect.map(Base64Url.encode)),
);

/** Persisted UTF-8 SHA-256, encoded as unpadded base64url. */
export const digest = (value: string) =>
  Effect.flatMap(Crypto.Crypto, (crypto) => crypto.digest("SHA-256", encoder.encode(value))).pipe(
    Effect.map((bytes) => TokenDigest.make(Base64Url.encode(bytes))),
  );
