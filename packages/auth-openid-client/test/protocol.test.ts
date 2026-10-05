import { it } from "@effect/vitest";
import * as OpenIdClient from "@yielded/auth-openid-client";
import * as GitHub from "@yielded/auth-openid-client/GitHub";
import {
  OAuthCallbackId,
  OAuthRedirectUri,
  OAuthIssuer,
  OAuthProviderKey,
  OAuthProtocol,
  type OAuthProtocolPreparation,
} from "@yielded/auth/OAuth";
import { RequestBindingFlowId } from "@yielded/auth/Operations";
import { DateTime, Deferred, Effect, Fiber, Redacted } from "effect";
import { FetchHttpClient } from "effect/http";
import { describe, expect } from "vite-plus/test";

import { expectTag } from "./helpers/oauth";

const json = (body: unknown, status = 200) => Response.json(body, { status });

const loadProtocol = (options: OpenIdClient.Options) =>
  OAuthProtocol.pipe(Effect.provide(OpenIdClient.layer(options)));

const github = (configurationGeneration?: number, issuance?: "active" | "retired") =>
  GitHub.gitHubOAuthAppProvider({
    configurationGeneration: configurationGeneration ?? 1,
    issuance: issuance ?? "active",
    clientId: `github-${configurationGeneration ?? 1}`,
    clientSecret: Redacted.make(`github-secret-${configurationGeneration ?? 1}`),
    callbacks: [
      {
        callbackId: OAuthCallbackId.make("github"),
        redirectUri: OAuthRedirectUri.make("https://app.test/auth/github/callback"),
      },
    ],
  });

const makeTransport = (input: { readonly userResponse?: () => Response } = {}) => {
  const requests: Array<{ url: string; clientId: string | null; method: string | undefined }> = [];

  const fetch: typeof globalThis.fetch = async (request, init) => {
    const url = request instanceof Request ? request.url : String(request);
    const form = init?.body instanceof URLSearchParams ? init.body : new URLSearchParams();

    requests.push({ url, clientId: form.get("client_id"), method: init?.method });
    if (url === "https://github.com/login/oauth/access_token")
      return json({
        access_token: "github-token-never-returned",
        token_type: "bearer",
        scope: "read:user",
      });
    if (url === "https://api.github.com/user")
      return (
        input.userResponse?.() ??
        json({ id: 42, login: "octocat", email: "untrusted-profile@example.test" })
      );
    throw new Error("Unexpected endpoint");
  };

  return { fetch, requests };
};

const begin = (protocol: OAuthProtocol["Service"], provider: "github") =>
  protocol.prepareAuthorization({
    provider: OAuthProviderKey.make(provider),
    flowId: RequestBindingFlowId.make(`flow-${provider}`),
  });

const exchange = Effect.fn("test.exchange")(function* (
  protocol: OAuthProtocol["Service"],
  started: OAuthProtocolPreparation,
) {
  return yield* protocol.exchangeVerifiedIdentity({
    configuration: started.configuration,
    secrets: started.secrets,
    verificationStartedAt: yield* DateTime.now,
    response: {
      _tag: "Code",
      state: started.secrets.state,
      code: Redacted.make("single-use-code"),
      ...(started.configuration.responseIssuerMode === "required"
        ? { issuer: started.configuration.issuer }
        : {}),
    },
  });
});

describe("OAuth protocol credential and resource lifetimes", () => {
  it.live(
    "finishes captured retired generations and never substitutes the active credentials",
    () =>
      Effect.gen(function* () {
        const transport = makeTransport();

        const old = yield* loadProtocol({
          providers: [github()],
          timeoutSeconds: 1,
        }).pipe(Effect.provideService(FetchHttpClient.Fetch, transport.fetch));

        const started = yield* begin(old, "github");

        const current = yield* loadProtocol({
          providers: [github(1, "retired"), github(2)],
          timeoutSeconds: 1,
        }).pipe(Effect.provideService(FetchHttpClient.Fetch, transport.fetch));

        yield* exchange(current, started);
        expect(
          transport.requests
            .filter((request) => request.method === "POST")
            .map((request) => request.clientId),
        ).toEqual(["github-1"]);
        const count = transport.requests.length;

        yield* expectTag(
          exchange(current, {
            ...started,
            configuration: {
              ...started.configuration,
              issuer: OAuthIssuer.make("https://accounts.google.com"),
            },
          }),
          "OAuthUnavailable",
        );
        yield* expectTag(
          exchange(current, {
            ...started,
            configuration: { ...started.configuration, configurationGeneration: 99 },
          }),
          "OAuthUnavailable",
        );
        expect(transport.requests).toHaveLength(count);
      }),
  );

  for (const termination of ["interruption", "timeout"]) {
    it.live(`${termination} cancels an acquired response body without repeating the exchange`, () =>
      Effect.gen(function* () {
        const reading = yield* Deferred.make<void>();
        let cancelled = false;

        const transport = makeTransport({
          userResponse: () =>
            new Response(
              new ReadableStream(
                {
                  pull() {
                    Deferred.doneUnsafe(reading, Effect.void);
                  },
                  cancel() {
                    cancelled = true;
                  },
                },
                { highWaterMark: 0 },
              ),
              { headers: { "content-type": "application/json" } },
            ),
        });

        const protocol = yield* loadProtocol({
          providers: [github()],
          timeoutSeconds: 1,
        }).pipe(Effect.provideService(FetchHttpClient.Fetch, transport.fetch));

        const started = yield* begin(protocol, "github");
        const fiber = yield* exchange(protocol, started).pipe(Effect.forkChild);

        yield* Deferred.await(reading);
        if (termination === "interruption") yield* Fiber.interrupt(fiber);
        else yield* expectTag(Fiber.join(fiber), "OAuthUnavailable");
        expect(cancelled).toBe(true);
        expect(transport.requests.filter((request) => request.method === "POST")).toHaveLength(1);
      }),
    );
  }
});
