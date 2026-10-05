import { Schema } from "effect";

// --- Identifiers -----------------------------------------------------------

/**
 * Stable identifier of one configured OAuth provider ("github", "gitlab").
 * Doubles as the routing key for callback endpoints, so it is constrained to
 * URL-safe lowercase slugs.
 */
export const OAuthProviderKey = Schema.String.check(
  Schema.isPattern(/^[a-z][a-z0-9-]{0,63}$/),
).pipe(Schema.brand("effect-auth/OAuthProviderKey"));

export type OAuthProviderKey = typeof OAuthProviderKey.Type;

export const OAuthGeneration = Schema.Int.check(
  Schema.isBetween({ minimum: 1, maximum: Number.MAX_SAFE_INTEGER }),
);
