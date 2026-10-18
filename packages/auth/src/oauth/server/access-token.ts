import { Signature } from "@yielded/crypto/Signature";
import { Jwk, Jwks, Jwt } from "@yielded/jose";
import { Cause, Clock, Effect, Redacted, Schema } from "effect";

import { origin } from "../../internal/origin";
import type * as OAuthScope from "../../OAuthScope";
import { SubjectId } from "../../Schema";
import {
  AccessClaims,
  BearerToken,
  ConfigurationError,
  InvalidToken,
  Random,
  Scope,
  makeAccessSchema,
  makeScopesSchema,
  Text,
  Unavailable,
  Url,
} from "./models";

/** RFC 9068 access tokens use a distinct type and audience from ID tokens. */
export const AccessTokenClaims = Schema.Struct({
  iss: Text,
  sub: SubjectId,
  aud: Text,
  iat: Schema.Natural,
  exp: Schema.Natural,
  jti: Random,
  grant_id: Random,
  client_id: Text,
  scope: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(8192)),
  auth_time: Schema.Natural,
  sid: Text,
  claims: Schema.optionalKey(AccessClaims),
});

export type AccessTokenClaims = typeof AccessTokenClaims.Type;

export interface AccessTokenVerifierWithKeySetOptions {
  readonly issuer: string;
  readonly resource: string;
  /** Only these declared scopes are accepted when supplied. */
  readonly scopes?: ReadonlyArray<OAuthScope.OAuthScope>;
}

export interface AccessTokenVerifierOptions extends AccessTokenVerifierWithKeySetOptions {
  /** Trusted keys from the issuer's JWKS; reacquire this verifier when keys rotate. */
  readonly publicKeys: ReadonlyArray<Jwk.PublicJwk>;
}

const makeVerifier = Effect.fnUntraced(function* <Scope extends OAuthScope.OAuthScope>(
  options: AccessTokenVerifierWithKeySetOptions,
  scope: Schema.Codec<Scope, string>,
) {
  const signature = yield* Signature;
  const keys = yield* Jwks.Jwks;
  const ScopeSchema = Schema.toType(scope);
  const ScopesSchema = makeScopesSchema(ScopeSchema);
  const AccessSchema = makeAccessSchema(ScopeSchema);

  const config = yield* Schema.decodeEffect(
    Schema.Struct({
      issuer: origin,
      resource: Url,
    }),
  )(options, { reportInput: false }).pipe(Effect.mapError(() => ConfigurationError.make({})));

  const decode = Effect.fnUntraced(function* (credential: Redacted.Redacted<string>) {
    if (!Schema.is(BearerToken)(Redacted.value(credential))) return yield* InvalidToken.make({});

    const { claims } = yield* Jwt.verifyWithKeySet(AccessTokenClaims, credential, {
      algorithms: ["RS256"],
      issuer: config.issuer,
      audience: config.resource,
      typ: "at+jwt",
      maxTokenAge: 600,
      requiredClaims: ["iss", "sub", "aud", "iat", "exp", "jti"],
    }).pipe(
      Effect.provideService(Jwks.Jwks, keys),
      Effect.provideService(Signature, signature),
      Effect.catchCause((cause) =>
        Effect.failCause(
          Cause.map(cause, (error) =>
            error._tag === "CryptoUnavailable" || error._tag === "JoseJwksUnavailable"
              ? Unavailable.make({})
              : InvalidToken.make({}),
          ),
        ),
      ),
    );

    const seconds = (yield* Clock.currentTimeMillis) / 1000;

    if (
      claims.iat > seconds ||
      claims.exp <= seconds ||
      claims.exp <= claims.iat ||
      claims.exp - claims.iat > 600 ||
      claims.auth_time > claims.iat
    )
      return yield* InvalidToken.make({});

    const scopes = yield* Schema.decodeUnknownEffect(ScopesSchema)(claims.scope.split(" ")).pipe(
      Effect.mapError(() => InvalidToken.make({})),
    );

    if (new Set(scopes).size !== scopes.length) return yield* InvalidToken.make({});

    return {
      claims,
      access: AccessSchema.make({
        subjectId: claims.sub,
        clientId: claims.client_id,
        grantId: claims.grant_id,
        resource: claims.aud,
        scopes,
        ...(claims.claims === undefined ? {} : { claims: claims.claims }),
      }),
    };
  });

  return {
    verify: Effect.fnUntraced(function* (credential: Redacted.Redacted<string>) {
      return (yield* decode(credential)).access;
    }),
    /** Verified protocol fields for an issuer checking its durable grant version. */
    decode,
  };
});

const makeLocalVerifier = Effect.fnUntraced(function* <Scope extends OAuthScope.OAuthScope>(
  options: AccessTokenVerifierOptions,
  scope: Schema.Codec<Scope, string>,
) {
  const publicKeys = yield* Schema.decodeUnknownEffect(
    Schema.NonEmptyArray(Jwk.PublicJwk).check(Schema.isMaxLength(16)),
  )(options.publicKeys, { reportInput: false }).pipe(
    Effect.mapError(() => ConfigurationError.make({})),
  );

  const keys = yield* Jwks.makeLocal({ keys: publicKeys }).pipe(
    Effect.mapError(() => ConfigurationError.make({})),
  );

  return yield* makeVerifier(options, scope).pipe(Effect.provideService(Jwks.Jwks, keys));
});

/** Verify offline with trusted public keys. Revocation and permission changes
 * take effect at token expiry; use short access lifetimes and renew through the issuer.
 * Retains only the signature service; verification uses the caller's clock and context.
 * Declared scopes narrow access only after every token scope passes validation.
 */
export function makeAccessTokenVerifier<const S extends ReadonlyArray<OAuthScope.OAuthScope>>(
  options: AccessTokenVerifierOptions & { readonly scopes: S },
): ReturnType<typeof makeLocalVerifier<S[number]>>;

export function makeAccessTokenVerifier(
  options: AccessTokenVerifierOptions,
): ReturnType<typeof makeLocalVerifier<OAuthScope.OAuthScope>>;

export function makeAccessTokenVerifier(options: AccessTokenVerifierOptions) {
  return makeLocalVerifier(
    options,
    options.scopes === undefined ? Scope : Schema.Literals(options.scopes),
  );
}

/** Verify with the supplied Jwks service, for example Jwks.layerRemote from
 * @yielded/jose. Captures only Jwks and Signature; the caller's clock and context
 * still govern verification. Retain the resolver's owning Scope while using the
 * verifier. Remote key failures become Unavailable; invalid tokens remain InvalidToken.
 *
 * The host configures the trusted key endpoint and owns its platform lifetime.
 * On Workers, retain the bounded verification with waitUntil and await its native
 * Promise in each request. Do not tie that retained verification to request abort.
 * Revocation and permission changes take effect at access-token expiry.
 */
export function makeAccessTokenVerifierWithKeySet<
  const S extends ReadonlyArray<OAuthScope.OAuthScope>,
>(
  options: AccessTokenVerifierWithKeySetOptions & { readonly scopes: S },
): ReturnType<typeof makeVerifier<S[number]>>;

export function makeAccessTokenVerifierWithKeySet(
  options: AccessTokenVerifierWithKeySetOptions,
): ReturnType<typeof makeVerifier<OAuthScope.OAuthScope>>;

export function makeAccessTokenVerifierWithKeySet(options: AccessTokenVerifierWithKeySetOptions) {
  return makeVerifier(
    options,
    options.scopes === undefined ? Scope : Schema.Literals(options.scopes),
  );
}
