import {
  type OAuthProtocolRejected,
  type OAuthProtocolConfiguration,
  type OAuthVerifiedExternalIdentity,
} from "@yielded/auth/OAuth";
import { type Effect, type Redacted, Schema } from "effect";

import type { TokenCompatibility, tokenCompatibility } from "./compatibility";

export class OpenIdClientConfigurationError extends Schema.TaggedError<OpenIdClientConfigurationError>()(
  "OpenIdClientConfigurationError",
  {
    reason: Schema.Literals([
      "provider",
      "generation",
      "issuer",
      "callback",
      "authentication",
      "parameters",
      "metadata",
      "identity-source",
    ]),
  },
) {}

export type OpenIdClientAuthentication =
  | { readonly method: "client_secret_basic"; readonly secret: Redacted.Redacted<string> }
  | { readonly method: "client_secret_post"; readonly secret: Redacted.Redacted<string> }
  | { readonly method: "none"; readonly publicClient: true };

export interface PlainOAuthIdentity {
  readonly subject: string;
  readonly profile?: NonNullable<OAuthVerifiedExternalIdentity["profile"]>;
}

interface ProviderGeneration {
  readonly provider: OAuthProtocolConfiguration["provider"];
  readonly configurationGeneration: OAuthProtocolConfiguration["configurationGeneration"];
  readonly issuance: "active" | "retired";
  /** Preserve this exact issuer identifier, including an optional trailing slash. */
  readonly issuer: OAuthProtocolConfiguration["issuer"];
  readonly responseIssuerMode: OAuthProtocolConfiguration["responseIssuerMode"];
  readonly clientId: string;
  readonly authentication: OpenIdClientAuthentication;
  readonly callbacks: ReadonlyArray<{
    readonly callbackId: OAuthProtocolConfiguration["callbackId"];
    readonly redirectUri: OAuthProtocolConfiguration["redirectUri"];
  }>;
  readonly scopes: ReadonlyArray<string>;
  readonly authorizationParameters?: Readonly<Record<string, string>>;
  readonly tokenParameters?: Readonly<Record<string, string>>;
}

export interface OpenIdClientOidcProvider extends ProviderGeneration {
  readonly protocol: "oidc";
  readonly idTokenSignedResponseAlg: "RS256";
  readonly maxAgeSeconds?: number;
}

export interface OpenIdClientOAuthProvider<R = never> extends ProviderGeneration {
  /** @internal First-party provider behavior, retained by the configuration codec. */
  readonly [tokenCompatibility]?: TokenCompatibility;
  readonly protocol: "oauth";
  readonly authorizationEndpoint: string;
  readonly tokenEndpoint: string;
  readonly pkceS256: true;
  readonly identitySource: {
    readonly url: string;
    readonly headers?: Readonly<Record<string, string>>;
    /** Receives only the freshly fetched authenticated identity body, never a grant. */
    readonly decodeIdentity: (
      body: unknown,
    ) => Effect.Effect<PlainOAuthIdentity, OAuthProtocolRejected, R>;
  };
}

export interface OpenIdClientOAuthProtocolOptions<R = never> {
  readonly providers: ReadonlyArray<OpenIdClientOidcProvider | OpenIdClientOAuthProvider<R>>;
  /** Per-request deadline; the method separately limits the complete exchange. */
  readonly timeoutSeconds: number;
}
