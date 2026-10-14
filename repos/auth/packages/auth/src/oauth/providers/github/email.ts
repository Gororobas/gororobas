import type { Redacted } from "effect";
import { Effect, Schema, Stream, Tracer } from "effect";
import { FetchHttpClient, HttpClient, HttpClientRequest } from "effect/http";

import { OAuthProtocolRejected, OAuthUnavailable } from "../../signInErrors";
import type { PlainOAuthIdentity } from "../shared/models";

const EmailPage = Schema.Array(
  Schema.Struct({
    email: Schema.NonEmptyString.check(Schema.isMaxLength(320)),
    primary: Schema.Boolean,
    verified: Schema.Boolean,
  }),
).check(Schema.isMaxLength(100));

const decodePage = Schema.decodeEffect(Schema.fromJsonString(EmailPage));
const unavailable = () => OAuthUnavailable.make({});

export const githubApiHeaders = Object.freeze({
  Accept: "application/vnd.github+json",
  "User-Agent": "effect-auth-github-oauth-app",
  "X-GitHub-Api-Version": "2026-03-10",
});

/** Installed only by the private GitHub capability. Grants never enter a public decoder. */
export const makeEmailEnrichment = Effect.fnUntraced(function* (timeoutMs: number) {
  const http = yield* HttpClient.HttpClient;
  const fetch = yield* FetchHttpClient.Fetch;

  const readPage = Effect.fnUntraced(
    function* (accessToken: Redacted.Redacted<string>, page: number) {
      // Never follow provider-supplied pagination URLs with a bearer credential.
      const url = `https://api.github.com/user/emails?per_page=100&page=${page}`;

      const request = HttpClientRequest.get(url).pipe(
        HttpClientRequest.setHeaders(githubApiHeaders),
        HttpClientRequest.bearerToken(accessToken),
      );

      const response = yield* HttpClient.withScope(http).execute(request);
      const announced = response.headers["content-length"];

      if (
        response.status !== 200 ||
        response.url !== url ||
        response.headers["content-type"]?.split(";", 1)[0]?.trim().toLowerCase() !==
          "application/json" ||
        (announced !== undefined && (!/^\d+$/u.test(announced) || Number(announced) > 65_536))
      )
        return yield* unavailable();
      const buffer = new Uint8Array(65_536);

      const length = yield* Stream.runFoldEffect(
        response.stream,
        () => 0,
        (length, chunk) => {
          if (chunk.byteLength > buffer.length - length) return Effect.fail(unavailable());
          buffer.set(chunk, length);

          return Effect.succeed(length + chunk.byteLength);
        },
      );

      const text = yield* Effect.try({
        try: () => new TextDecoder("utf-8", { fatal: true }).decode(buffer.subarray(0, length)),
        catch: unavailable,
      });

      return yield* decodePage(text).pipe(Effect.mapError(() => OAuthProtocolRejected.make({})));
    },
    Effect.scoped,
    Effect.provideService(FetchHttpClient.Fetch, fetch),
    Effect.provideService(FetchHttpClient.RequestInit, {
      redirect: "manual",
      credentials: "omit",
      cache: "no-store",
    }),
    Effect.provideService(Tracer.DisablePropagation, true),
    Effect.catchTag("HttpClientError", unavailable),
    Effect.timeoutOrElse({ duration: timeoutMs, orElse: unavailable }),
  );

  const primaryEmail = Effect.fnUntraced(function* (accessToken: Redacted.Redacted<string>) {
    let primaryCount = 0;
    let email: string | undefined;

    for (let page = 1; page <= 10; page++) {
      const entries = yield* readPage(accessToken, page);

      for (const entry of entries) {
        if (!entry.primary) continue;
        primaryCount++;
        if (entry.verified) email = entry.email;
      }
      if (entries.length < 100) return primaryCount === 1 ? email : undefined;
    }

    // A full last page cannot establish that the primary is unambiguous.
    return yield* unavailable();
  });

  return Effect.fnUntraced(function* (
    identity: PlainOAuthIdentity,
    accessToken: Redacted.Redacted<string>,
  ): Effect.fn.Return<PlainOAuthIdentity, OAuthProtocolRejected | OAuthUnavailable> {
    const email = yield* primaryEmail(accessToken);
    const profile = { ...identity.profile };

    delete profile.email;
    delete profile.emailVerified;

    return {
      ...identity,
      profile: { ...profile, ...(email === undefined ? {} : { email, emailVerified: true }) },
    };
  });
});
