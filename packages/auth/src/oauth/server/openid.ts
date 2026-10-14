import type { Hmac } from "@yielded/crypto/Hmac";
import type { Signature } from "@yielded/crypto/Signature";
import { Jwk, Jwt } from "@yielded/jose";
import { Effect, Redacted, Schema } from "effect";

import type { Authentication } from "./models";
import { ConfigurationError, OpenIdProfile, Text, Unavailable } from "./models";

/** Keep retired public keys available while their ID tokens can still be accepted. */
export interface IdentitySigningKeys {
  readonly activeKeyId: string;
  readonly privateKey: Redacted.Redacted<unknown>;
  readonly publicKeys: ReadonlyArray<Jwk.PublicJwk>;
}

const Subject = Schema.String.check(Schema.isPattern(/^[\x21-\x7e]{1,255}$/));

const IdentityToken = Schema.Struct({
  iss: Text,
  sub: Subject,
  aud: Text,
  iat: Schema.Natural,
  exp: Schema.Natural,
  auth_time: Schema.Natural,
  sid: Text,
  nonce: Schema.optionalKey(Text),
  ...OpenIdProfile.fields,
});

export const scopedProfile = (profile: OpenIdProfile, scopes: ReadonlyArray<string>) => ({
  ...(scopes.includes("profile")
    ? {
        ...(profile.name === undefined ? {} : { name: profile.name }),
        ...(profile.preferred_username === undefined
          ? {}
          : { preferred_username: profile.preferred_username }),
      }
    : {}),
  ...(scopes.includes("email")
    ? {
        ...(profile.email === undefined ? {} : { email: profile.email }),
        ...(profile.email === undefined || profile.email_verified === undefined
          ? {}
          : { email_verified: profile.email_verified }),
      }
    : {}),
});

export const makeIdentityTokens = Effect.fnUntraced(function* (options: IdentitySigningKeys) {
  const services = yield* Effect.context<Hmac | Signature>();

  const keys = yield* Schema.decodeUnknownEffect(
    Schema.Struct({
      activeKeyId: Schema.NonEmptyString.check(Schema.isMaxLength(256)),
      privateKey: Schema.Redacted(Schema.Unknown),
      publicKeys: Schema.NonEmptyArray(Jwk.PublicJwk).check(Schema.isMaxLength(16)),
    }),
  )(options, { reportInput: false }).pipe(Effect.mapError(() => ConfigurationError.make({})));

  const signingKey = yield* Jwk.importPrivate(keys.privateKey, "RS256").pipe(
    Effect.mapError(() => ConfigurationError.make({})),
  );

  const privateJwk = Redacted.value(signingKey.jwk);
  const active = keys.publicKeys.find((key) => key.kid === keys.activeKeyId);

  if (
    privateJwk.kty !== "RSA" ||
    active?.kty !== "RSA" ||
    privateJwk.n !== active.n ||
    privateJwk.e !== active.e ||
    keys.publicKeys.some((key) => key.kid === undefined) ||
    new Set(keys.publicKeys.map((key) => key.kid)).size !== keys.publicKeys.length
  )
    return yield* ConfigurationError.make({});

  for (const key of keys.publicKeys) {
    yield* Jwk.importPublic(key, "RS256").pipe(Effect.mapError(() => ConfigurationError.make({})));
  }

  return {
    jwks: { keys: keys.publicKeys },
    issue: Effect.fnUntraced(function* (input: {
      readonly issuer: string;
      readonly clientId: string;
      readonly authentication: Authentication;
      readonly nonce?: string;
      readonly profile: OpenIdProfile;
      readonly scopes: ReadonlyArray<string>;
      readonly nowMillis: number;
    }) {
      const issuedAt = Math.floor(input.nowMillis / 1000);

      return yield* Jwt.sign(
        IdentityToken,
        {
          iss: input.issuer,
          sub: input.authentication.subjectId,
          aud: input.clientId,
          iat: issuedAt,
          exp: Math.min(issuedAt + 300, Math.floor(input.authentication.expiresAtMillis / 1000)),
          auth_time: Math.floor(input.authentication.authenticatedAtMillis / 1000),
          sid: input.authentication.sessionId,
          ...(input.nonce === undefined ? {} : { nonce: input.nonce }),
          ...scopedProfile(input.profile, input.scopes),
        },
        signingKey,
        { alg: "RS256", kid: keys.activeKeyId, typ: "JWT" },
      ).pipe(
        Effect.provideContext(services),
        Effect.mapError(() => Unavailable.make({})),
      );
    }),
  };
});
