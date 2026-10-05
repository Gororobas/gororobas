import { OAuthProviderKey, OAuthProtocolRejected } from "@yielded/auth/OAuth";
import { Effect, Schema } from "effect";

import type { PlainOAuthIdentity } from "../openid-client/models";
import { GitHubUserProfile } from "./profile";

export const gitHubOAuthAppProviderKey = OAuthProviderKey.make("github");

// oxlint-disable-next-line no-restricted-properties -- GitHub /user is an untyped, freshly authenticated JSON boundary.
const decode = Schema.decodeUnknownEffect(GitHubUserProfile);

export const decodeGitHubIdentity = Effect.fn("GitHubOAuthApp.decodeIdentity")(function* (
  body: unknown,
): Effect.fn.Return<PlainOAuthIdentity, OAuthProtocolRejected> {
  const value = yield* decode(body).pipe(Effect.mapError(() => OAuthProtocolRejected.make({})));
  const displayName = value.name?.trim() || value.login;

  return {
    subject: String(value.id),
    profile: {
      ...(displayName === undefined ? {} : { displayName }),
      ...(value.login === undefined ? {} : { handle: value.login }),
      ...(value.avatar_url === undefined ? {} : { avatarUrl: value.avatar_url }),
      ...(value.html_url === undefined ? {} : { profileUrl: value.html_url }),
      ...(value.email === null || value.email === undefined ? {} : { email: value.email }),
      providerData: value,
    },
  };
});
