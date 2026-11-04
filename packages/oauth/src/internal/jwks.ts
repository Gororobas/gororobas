import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as HttpClient from "effect/http/HttpClient";
import * as HttpClientError from "effect/http/HttpClientError";
import * as HttpClientResponse from "effect/http/HttpClientResponse";
import * as Jwk from "effect/jose/Jwk";
import * as Jwks from "effect/jose/Jwks";
import * as Schema from "effect/Schema";
import * as Semaphore from "effect/Semaphore";

import { Unavailable } from "../Errors";
import * as Transport from "./transport";
import * as V from "./validation";

const Issuers = Schema.Struct({
  keys: Schema.Array(
    Schema.Struct({
      issuer: Schema.optionalKey(Schema.String.check(Schema.isMaxLength(2048))),
    }),
  ).check(Schema.isMaxLength(64)),
});

const keyId = Schema.encodeSync(Schema.fromJsonString(Jwk.PublicJwk));

/** OIDC owns Microsoft's per-key issuer extension, which Effect's JOSE schema
 * omits. Retain it beside the bounded key document; Effect owns key selection,
 * cryptography, caching, refresh coalescing and the resolver's scoped lifetime.
 */
export const makeRemote = Effect.fnUntraced(function* (
  options: Transport.Options & { readonly url: string },
) {
  const http = yield* Transport.capture;
  const issuers = new Map<string, string | undefined>();
  const authorities = new WeakMap<Jwk.PublicKey, string | undefined>();
  const resolving = yield* Semaphore.make(1);

  yield* Effect.addFinalizer(() => Effect.sync(() => issuers.clear()));

  const client = HttpClient.make((request) =>
    Effect.gen(function* () {
      const response = yield* Transport.request(http, request, options);

      if (response.status !== 200) return yield* Unavailable.make({});
      const document = yield* Transport.json(response);
      const body = yield* V.reveal(document.body);
      const extensions = yield* V.decode(Issuers, body);
      const keySet = yield* V.decode(Jwks.KeySet, body);

      issuers.clear();
      for (const [index, key] of keySet.keys.entries()) {
        if (Schema.is(Jwk.PublicJwk)(key)) issuers.set(keyId(key), extensions.keys[index]?.issuer);
      }

      return HttpClientResponse.fromWeb(request, Response.json(body));
    }).pipe(
      Effect.catchCause((cause) =>
        Effect.failCause(
          Cause.map(
            cause,
            () =>
              new HttpClientError.HttpClientError({
                reason: new HttpClientError.TransportError({ request }),
              }),
          ),
        ),
      ),
    ),
  );

  const service = yield* Jwks.makeRemote({
    url: options.url,
    timeout: options.timeoutMs,
    maxResponseBytes: options.maxResponseBytes,
  }).pipe(Effect.provideService(HttpClient.HttpClient, client));

  return {
    service: Jwks.Jwks.of({
      // Snapshot the extension before another lookup can refresh the document.
      // Signature verification remains concurrent and retains this authority.
      resolve: (selection) =>
        resolving.withPermits(1)(
          service.resolve(selection).pipe(
            Effect.map((key) => {
              const selected = { ...key };

              authorities.set(selected, issuers.get(keyId(key.jwk)));

              return selected;
            }),
          ),
        ),
    }),
    issuerOf: (key: Jwk.PublicKey) => authorities.get(key),
  };
});
