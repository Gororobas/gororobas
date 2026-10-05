import {
  OAuthProviderKey,
  OAuthCallbackId,
  OAuthGeneration,
  OAuthIssuer,
  OAuthRedirectUri,
} from "@yielded/auth/OAuth";
import { Effect, type Redacted, Schema } from "effect";

import { authentication as providerAuthentication } from "./configuration";
import { OpenIdClientConfigurationError, type OpenIdClientAuthentication } from "./models";

/** A single callback is named after its provider unless callbackId is supplied.
 * Use callbacks for multiple destinations. URLs are validated, never inferred. */
export type RegistrationOptions = {
  /** Defaults to 1. Increment when changing configuration; retain the previous
   * generation as retired until all flows using it have expired. */
  readonly configurationGeneration?: number;
  /** Defaults to active. Retired generations only finish existing flows. */
  readonly issuance?: "active" | "retired";
} & (
  | {
      readonly redirectUri: string;
      readonly callbackId?: string;
      readonly callbacks?: never;
    }
  | {
      readonly callbacks: ReadonlyArray<{
        readonly callbackId: string;
        readonly redirectUri: string;
      }>;
      readonly redirectUri?: never;
      readonly callbackId?: never;
    }
);

const registrationFields = {
  configurationGeneration: OAuthGeneration.pipe(Schema.withDecodingDefaultKey(Effect.succeed(1))),
  issuance: Schema.Literals(["active", "retired"]).pipe(
    Schema.withDecodingDefaultKey(Effect.succeed("active")),
  ),
};

const registration = Schema.Union([
  Schema.Struct({
    ...registrationFields,
    redirectUri: OAuthRedirectUri,
    callbackId: Schema.optionalKey(OAuthCallbackId),
    callbacks: Schema.optionalKey(Schema.Never),
  }),
  Schema.Struct({
    ...registrationFields,
    callbacks: Schema.Array(
      Schema.Struct({ callbackId: OAuthCallbackId, redirectUri: OAuthRedirectUri }),
    ).check(Schema.isMinLength(1), Schema.isMaxLength(16)),
    redirectUri: Schema.optionalKey(Schema.Never),
    callbackId: Schema.optionalKey(Schema.Never),
  }),
]);

export const resolveRegistration = (input: RegistrationOptions, provider: string) => {
  const saved = Schema.decodeSync(registration)(input);

  return {
    configurationGeneration: saved.configurationGeneration,
    issuance: saved.issuance,
    callbacks: saved.callbacks ?? [
      {
        callbackId: saved.callbackId ?? Schema.decodeSync(OAuthCallbackId)(provider),
        redirectUri: saved.redirectUri,
      },
    ],
  };
};

type AuthenticationOptions =
  | {
      readonly clientSecret: Redacted.Redacted<string>;
      /** Defaults to client_secret_basic. Public clients use authentication explicitly. */
      readonly tokenEndpointAuthMethod?: "client_secret_basic" | "client_secret_post";
      readonly authentication?: never;
    }
  | {
      readonly authentication: OpenIdClientAuthentication;
      readonly clientSecret?: never;
      readonly tokenEndpointAuthMethod?: never;
    };

const authentication = Schema.Union([
  Schema.Struct({
    clientSecret: Schema.toType(Schema.RedactedFromValue(Schema.NonEmptyString)),
    tokenEndpointAuthMethod: Schema.Literals(["client_secret_basic", "client_secret_post"]).pipe(
      Schema.withDecodingDefaultKey(Effect.succeed("client_secret_basic")),
    ),
    authentication: Schema.optionalKey(Schema.Never),
  }),
  Schema.Struct({
    authentication: Schema.toType(providerAuthentication),
    clientSecret: Schema.optionalKey(Schema.Never),
    tokenEndpointAuthMethod: Schema.optionalKey(Schema.Never),
  }),
]);

/** Shared input conventions for generic OAuth/OIDC sign-in and connected grants. */
export type ProviderOptions<P> = P extends { readonly protocol: "oauth" | "oidc" }
  ? Omit<
      P,
      | "provider"
      | "issuer"
      | "configurationGeneration"
      | "issuance"
      | "callbacks"
      | "authentication"
      | "responseIssuerMode"
      | "idTokenSignedResponseAlg"
      | "pkceS256"
    > &
      RegistrationOptions &
      AuthenticationOptions & {
        readonly provider: string;
        readonly issuer: string;
        /** Defaults to required. Explicitly opt out only when the host does not support RFC 9207. */
        readonly responseIssuerMode?: "required" | "unsupported";
      } & (P extends { readonly protocol: "oidc" }
        ? { readonly idTokenSignedResponseAlg?: "RS256" }
        : { readonly pkceS256?: true })
  : never;

export const resolveProvider = <
  P extends {
    readonly provider: string;
    readonly issuer: string;
    readonly responseIssuerMode?: "required" | "unsupported";
  } & RegistrationOptions &
    AuthenticationOptions,
>(
  input: P,
) => {
  const credentials = Schema.decodeSync(authentication)(input);

  return {
    ...input,
    ...resolveRegistration(input, input.provider),
    provider: Schema.decodeSync(OAuthProviderKey)(input.provider),
    issuer: Schema.decodeSync(OAuthIssuer)(input.issuer),
    responseIssuerMode:
      input.responseIssuerMode === undefined ? ("required" as const) : input.responseIssuerMode,
    authentication: credentials.authentication ?? {
      method: credentials.tokenEndpointAuthMethod,
      secret: credentials.clientSecret,
    },
  };
};

/** Configuration errors never retain input values or credentials. */
export const resolveOptions = <A>(resolve: () => A) =>
  Effect.try({
    try: resolve,
    catch: () => OpenIdClientConfigurationError.make({ reason: "provider" }),
  });
