import { OAuthScope, OAuthServer } from "@yielded/auth";
import * as WebCrypto from "@yielded/auth/WebCrypto";
import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as FetchHttpClient from "effect/http/FetchHttpClient";
import * as Jwks from "effect/jose/Jwks";
import * as Layer from "effect/Layer";
import * as ManagedRuntime from "effect/ManagedRuntime";
import * as Redacted from "effect/Redacted";

// User-requested red/green seam: real Worker HTTP disconnect during remote JWKS
// loading, concurrent signed-token verification, timeout and subsequent recovery.
// The host supplies fixed authority; no request or token selects the key URL.
export const makeWorker = (authority: {
  readonly issuer: string;
  readonly resource: string;
  readonly jwksUrl: string;
}) => {
  const runtime = ManagedRuntime.make(
    Jwks.layerRemote({ url: authority.jwksUrl, maxKeys: 16 }).pipe(
      Layer.provideMerge(Layer.merge(WebCrypto.layer, FetchHttpClient.layer)),
    ),
  );

  return {
    async fetch(
      request: Request,
      _environment: unknown,
      context: { waitUntil(promise: Promise<unknown>): void },
    ) {
      const authorization = request.headers.get("authorization") ?? "";

      if (!authorization.startsWith("Bearer ")) return new Response(null, { status: 401 });

      const verification = runtime.runPromiseExit(
        Effect.gen(function* () {
          const verifier = yield* OAuthServer.makeAccessTokenVerifierWithKeySet({
            issuer: authority.issuer,
            resource: authority.resource,
            scopes: [OAuthScope.make("documents:read")],
          });

          return yield* verifier.verify(Redacted.make(authorization.slice(7)));
        }),
      );

      // Retain only verification, whose remote refresh has a five-second deadline.
      // The platform owns this lifetime extension, not the protocol library.
      context.waitUntil(verification);

      const result = await verification;

      if (Exit.isFailure(result)) {
        const invalid =
          result.cause.reasons.length > 0 &&
          result.cause.reasons.every(
            (reason) =>
              Cause.isFailReason(reason) && reason.error._tag === "OAuthServerInvalidToken",
          );

        return new Response(null, { status: invalid ? 401 : 503 });
      }

      return Response.json({ subjectId: result.value.subjectId, scopes: result.value.scopes });
    },
    dispose: () => runtime.dispose(),
  };
};
