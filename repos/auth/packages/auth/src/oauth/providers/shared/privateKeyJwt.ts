import { Unavailable } from "@yielded/oauth/Errors";
import * as Cause from "effect/Cause";
import * as Clock from "effect/Clock";
import * as Context from "effect/Context";
import * as Signature from "effect/crypto/Signature";
import * as Effect from "effect/Effect";
import * as Base64 from "effect/encoding/Base64";
import * as Exit from "effect/Exit";
import * as Jwk from "effect/jose/Jwk";
import * as Jwt from "effect/jose/Jwt";
import * as Layer from "effect/Layer";
import * as Redacted from "effect/Redacted";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import * as Scope from "effect/Scope";
import * as Semaphore from "effect/Semaphore";

import { makeScopedOperation } from "../../../internal/scoped-operation";
import {
  isPrivateKeyAuthentication,
  type OpenIdConnectAuthentication,
  type PrivateKeyJwt,
} from "./models";

const Claims = Schema.Struct({
  iss: Schema.NonEmptyString,
  sub: Schema.NonEmptyString,
  aud: Schema.NonEmptyString,
  iat: Schema.Finite,
  exp: Schema.Finite,
});

/** Sign one ES256 client-secret JWT with an opaque Effect signing key. */
export const signPrivateKeyJwt = Effect.fn("OpenIdConnect.signPrivateKeyJwt")(function* (
  policy: Omit<PrivateKeyJwt, "privateKey">,
  key: Jwk.PrivateKey,
) {
  const now = Math.floor((yield* Clock.currentTimeMillis) / 1000);

  return yield* Jwt.sign(
    Claims,
    {
      iss: policy.issuer,
      sub: policy.subject,
      aud: policy.audience,
      iat: now,
      exp: now + policy.lifetimeSeconds,
    },
    key,
    { kid: policy.keyId },
  ).pipe(
    Effect.catchCause((cause) => Effect.failCause(Cause.map(cause, () => Unavailable.make({})))),
  );
});

/** Import detached PKCS8 bytes. The acquiring Scope owns the returned key. */
const importPrivateKeyJwt = Effect.fnUntraced(function* (policy: PrivateKeyJwt) {
  const der = Result.getOrUndefined(Base64.decode(Redacted.value(policy.privateKey)));

  if (der === undefined || der.length === 0) return yield* Unavailable.make({});

  return yield* Jwk.importPkcs8(Redacted.make(der), policy.algorithm, {
    kid: policy.keyId,
  }).pipe(
    Effect.catchCause((cause) => Effect.failCause(Cause.map(cause, () => Unavailable.make({})))),
    Effect.ensuring(Effect.sync(() => der.fill(0))),
  );
});

/** Inward client-authentication port. Concrete policy is provided at composition. */
export class PrivateKeyClientSecret extends Context.Service<
  PrivateKeyClientSecret,
  {
    readonly mint: (
      authentication: OpenIdConnectAuthentication,
    ) => Effect.Effect<Redacted.Redacted<string> | undefined, Unavailable>;
  }
>()("effect-auth/oauth/providers/PrivateKeyClientSecret") {
  /** Static client secrets stay on the OAuth client. */
  static readonly layerUnused = Layer.succeed(PrivateKeyClientSecret, {
    mint: () => Effect.as(Effect.void, undefined),
  });

  /** Mint fresh ES256 assertions with one parsed key per installed policy. Keys
   * stay inside this Layer's crypto services and generation; teardown joins
   * active mints before releasing retained key references. */
  static readonly make = Effect.gen(function* () {
    const signature = yield* Signature.Signature;
    const keys = new Map<PrivateKeyJwt, Jwk.PrivateKey>();

    const scope = yield* Effect.acquireRelease(Scope.make(), (scope) =>
      Scope.close(scope, Exit.void).pipe(Effect.ensuring(Effect.sync(() => keys.clear()))),
    );

    const run = yield* makeScopedOperation(() => Unavailable.make({})).pipe(
      Effect.provideService(Scope.Scope, scope),
    );

    const imports = yield* Semaphore.make(1);

    const mint = Effect.fnUntraced(
      function* (policy: PrivateKeyJwt) {
        const existing = keys.get(policy);

        const key =
          existing ??
          (yield* imports.withPermits(1)(
            Effect.gen(function* () {
              const existing = keys.get(policy);

              if (existing !== undefined) return existing;

              const key = yield* importPrivateKeyJwt(policy);

              keys.set(policy, key);

              return key;
            }),
          ));

        return yield* signPrivateKeyJwt(policy, key);
      },
      Effect.provideService(Signature.Signature, signature),
    );

    return PrivateKeyClientSecret.of({
      mint: (authentication) =>
        !isPrivateKeyAuthentication(authentication)
          ? Effect.as(Effect.void, undefined)
          : run(mint(authentication.privateKeyJwt)),
    });
  });

  static readonly layer = Layer.effect(PrivateKeyClientSecret, PrivateKeyClientSecret.make);
}
