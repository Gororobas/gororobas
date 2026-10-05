import { type OAuthConnectedProfile } from "@yielded/auth/OAuth";

import type {
  OpenIdClientAuthentication,
  OpenIdClientOAuthProvider,
  OpenIdClientOidcProvider,
} from "../models";

export { OpenIdClientConfigurationError } from "../models";
export type { OpenIdClientAuthentication, PlainOAuthIdentity } from "../models";

export type OpenIdClientConnectedRevocation =
  | { readonly mode: "unsupported" }
  | {
      readonly mode: "rfc7009";
      /** Verified provider effects stay within the stable connected cohort.
       * This does not promise remote erasure of all sibling tokens. */
      readonly scope: "cohort";
      readonly tokenTypes: "access" | "access-and-refresh";
      readonly authentication: OpenIdClientAuthentication;
      /** Required for plain OAuth; OIDC overrides must equal discovery exactly. */
      readonly endpoint?: string;
    };

export type OpenIdClientConnectedRefreshExpiry =
  | "unreported"
  | {
      readonly field: "refresh_expires_in" | "refresh_token_expires_in";
      readonly zero: "unreported" | "expired";
    };

interface ConnectedProvider {
  readonly clientRegistrationId: OAuthConnectedProfile["clientRegistrationId"];
  readonly profiles: ReadonlyArray<OAuthConnectedProfile>;
  /** Explicit issuer issuance contract. Values are declared grant targets,
   * not proof of an opaque access token's audience. */
  readonly resourceIndicators: "unsupported" | "rfc8707";
  readonly refreshParameters?: Readonly<Record<string, string>>;
  readonly refreshExpiry: OpenIdClientConnectedRefreshExpiry;
  readonly revocation: OpenIdClientConnectedRevocation;
}

export interface OpenIdClientConnectedOidcProvider
  extends Omit<OpenIdClientOidcProvider, "scopes">, ConnectedProvider {}

export interface OpenIdClientConnectedOAuthProvider<R = never>
  extends Omit<OpenIdClientOAuthProvider<R>, "scopes">, ConnectedProvider {}

export interface OpenIdClientConnectedProtocolOptions<R = never> {
  readonly providers: ReadonlyArray<
    OpenIdClientConnectedOidcProvider | OpenIdClientConnectedOAuthProvider<R>
  >;
  readonly timeoutSeconds: number;
}
