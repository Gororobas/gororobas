import {
  OAuthProtocolRejected,
  type OAuthDisplayProfile,
  type OAuthIssuer,
} from "@yielded/auth/OAuth";
import { Effect, Schema } from "effect";

const text = Schema.String.check(Schema.isMaxLength(256));
const url = Schema.String.check(Schema.isMaxLength(2048));

const standardOidcUserProfile = Schema.Struct({
  name: Schema.optionalKey(text),
  given_name: Schema.optionalKey(text),
  family_name: Schema.optionalKey(text),
  middle_name: Schema.optionalKey(text),
  nickname: Schema.optionalKey(text),
  preferred_username: Schema.optionalKey(text),
  profile: Schema.optionalKey(url),
  picture: Schema.optionalKey(url),
  website: Schema.optionalKey(url),
  email: Schema.optionalKey(Schema.String.check(Schema.isMaxLength(320))),
  email_verified: Schema.optionalKey(Schema.Boolean),
  gender: Schema.optionalKey(text),
  birthdate: Schema.optionalKey(text),
  zoneinfo: Schema.optionalKey(text),
  locale: Schema.optionalKey(text),
  phone_number: Schema.optionalKey(text),
  phone_number_verified: Schema.optionalKey(Schema.Boolean),
  address: Schema.optionalKey(
    Schema.Struct({
      formatted: Schema.optionalKey(url),
      street_address: Schema.optionalKey(url),
      locality: Schema.optionalKey(text),
      region: Schema.optionalKey(text),
      postal_code: Schema.optionalKey(text),
      country: Schema.optionalKey(text),
    }),
  ),
  updated_at: Schema.optionalKey(
    Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: Number.MAX_SAFE_INTEGER })),
  ),
});

/** Standard OpenID Connect user claims, plus Google's optional hosted domain.
 * The adapter projects these from verified ID tokens without requesting additional
 * scopes or fetching UserInfo. Protocol claims and credentials are excluded;
 * provider assertions never authorize local account linking by themselves. */
export const OidcUserProfile = Schema.Struct({
  ...standardOidcUserProfile.fields,
  /** Hosted domain for a Google Workspace or Cloud organization. The adapter
   * reads it from verified Google ID tokens; other issuers' `hd` claims are ignored. */
  hd: Schema.optionalKey(Schema.String.check(Schema.isMaxLength(253))),
});

export type OidcUserProfile = typeof OidcUserProfile.Type;

export const decodeOidcProfile = Effect.fn("OpenIdClient.decodeProfile")(function* (
  claims: unknown,
  issuer: typeof OAuthIssuer.Type,
): Effect.fn.Return<OAuthDisplayProfile | undefined, OAuthProtocolRejected> {
  // oxlint-disable-next-line no-restricted-properties -- Project claims from an ID token already verified against this issuer.
  const profile = yield* Schema.decodeUnknownEffect(
    issuer === "https://accounts.google.com" ? OidcUserProfile : standardOidcUserProfile,
  )(claims).pipe(Effect.mapError(() => OAuthProtocolRejected.make({})));

  if (Object.keys(profile).length === 0) return undefined;
  const displayName = profile.name?.trim() || profile.preferred_username;

  return {
    ...(displayName === undefined ? {} : { displayName }),
    ...(profile.preferred_username === undefined ? {} : { handle: profile.preferred_username }),
    ...(profile.picture === undefined ? {} : { avatarUrl: profile.picture }),
    ...(profile.profile === undefined ? {} : { profileUrl: profile.profile }),
    ...(profile.email === undefined ? {} : { email: profile.email }),
    ...(profile.email_verified === undefined ? {} : { emailVerified: profile.email_verified }),
    providerData: profile,
  };
});
