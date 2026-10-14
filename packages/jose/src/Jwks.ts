import { Signature } from "@yielded/crypto/Signature";
import {
  Clock,
  Context,
  Deferred,
  Effect,
  Exit,
  Layer,
  Option,
  Schema,
  Scope,
  Semaphore,
  Stream,
  SynchronizedRef,
} from "effect";
import { FetchHttpClient, HttpClient } from "effect/http";

import { AmbiguousKey, InvalidKey, JwksUnavailable, KeyNotFound, type KeyError } from "./Errors";
import { json } from "./internal/encoding";
import * as KeyInput from "./internal/keyInput";
import { AsymmetricAlgorithm, importPublic, type PublicKey, PublicJwk } from "./Jwk";

export const KeySet = Schema.Struct({
  keys: Schema.Array(PublicJwk).check(Schema.isMaxLength(KeyInput.maxArrayLength)),
});

export type KeySet = typeof KeySet.Type;

export const Selection = Schema.Struct({
  algorithm: AsymmetricAlgorithm,
  kid: Schema.optionalKey(Schema.String.check(Schema.isMaxLength(256))),
});

export type Selection = typeof Selection.Type;

export class Jwks extends Context.Service<
  Jwks,
  {
    readonly resolve: (selection: Selection) => Effect.Effect<PublicKey, KeyError, Signature>;
  }
>()("@yielded/jose/Jwks") {}

/** Capture one detached immutable key-set generation without acquiring resources.
 * Retain the resolver for that generation; create a new one when keys change.
 * Each resolution still uses the caller's Signature service and selection policy. */
export const makeLocal = Effect.fnUntraced(function* (input: unknown) {
  const set = yield* readSet(input);
  const importKey = makePublicImporter();

  return Jwks.of({
    resolve: Effect.fnUntraced(function* (input) {
      const selection = yield* readSelection(input);

      return yield* importKey(yield* select(set, selection), selection.algorithm);
    }),
  });
});

/** One immutable public key set; local selection never requires HttpClient. */
export const layerLocal = (input: unknown): Layer.Layer<Jwks, InvalidKey> =>
  Layer.effect(Jwks, makeLocal(input));

export interface RemoteOptions {
  /** Trusted application configuration, never a URL from a token. HTTPS only. */
  readonly url: string;
  readonly cacheTimeMs?: number;
  readonly cooldownMs?: number;
  readonly timeoutMs?: number;
  readonly maxResponseBytes?: number;
  readonly maxKeys?: number;
  readonly maxWaiters?: number;
}

const readSet = (input: unknown) =>
  Effect.try({
    try: () => KeyInput.keySet(input),
    catch: () => InvalidKey.make({}),
  }).pipe(
    Effect.flatMap(Effect.fromResult),
    Effect.flatMap((captured) =>
      Schema.decodeUnknownEffect(KeySet)(captured, { reportInput: false }).pipe(
        Effect.mapError(() => InvalidKey.make({})),
      ),
    ),
    Effect.map((set) => {
      for (const key of set.keys) {
        KeyInput.detach(key);
        if (key.key_ops !== undefined) Object.freeze(key.key_ops);
        Object.freeze(key);
      }
      Object.freeze(set.keys);

      return Object.freeze(KeyInput.detach(set));
    }),
  );

const readSelection = (input: Selection) =>
  Effect.try({
    try: () => KeyInput.object(input),
    catch: () => InvalidKey.make({}),
  }).pipe(
    Effect.flatMap((captured) =>
      Schema.decodeUnknownEffect(Selection)(captured, { reportInput: false }).pipe(
        Effect.mapError(() => InvalidKey.make({})),
      ),
    ),
    Effect.map(KeyInput.detach),
  );

const select = Effect.fnUntraced(function* (set: KeySet, selection: Selection) {
  const candidates = set.keys.filter(
    (key) =>
      (selection.kid === undefined || key.kid === selection.kid) &&
      (key.alg === undefined || key.alg === selection.algorithm) &&
      (key.use === undefined || key.use === "sig") &&
      (key.key_ops === undefined || key.key_ops.includes("verify")) &&
      (selection.algorithm === "ES256"
        ? key.kty === "EC"
        : selection.algorithm === "EdDSA"
          ? key.kty === "OKP"
          : key.kty === "RSA"),
  );

  if (candidates.length === 0) return yield* KeyNotFound.make({});
  if (candidates.length !== 1) return yield* AmbiguousKey.make({});

  return candidates[0];
});

const makePublicImporter = () => {
  // Only readSet's immutable snapshots enter this cache. Weak keys release old
  // remote snapshots and service overrides; algorithms are a fixed finite set.
  const keys = new WeakMap<
    PublicJwk,
    WeakMap<Signature["Service"], Map<AsymmetricAlgorithm, PublicKey>>
  >();

  return Effect.fnUntraced(function* (jwk: PublicJwk, algorithm: AsymmetricAlgorithm) {
    const signatures = yield* Signature;
    let services = keys.get(jwk);

    if (services === undefined) keys.set(jwk, (services = new WeakMap()));
    let algorithms = services.get(signatures);

    if (algorithms === undefined) services.set(signatures, (algorithms = new Map()));
    let key = algorithms.get(algorithm);

    if (key === undefined) {
      key = yield* importPublic(jwk, algorithm);
      // Publish successes only. Failed or interrupted imports remain retryable.
      algorithms.set(algorithm, key);
    }

    // Metadata is frozen, but Uint8Array contents cannot be. Never expose the
    // retained material to callers or to a verification service implementation.
    return Object.freeze({ ...key, material: new Uint8Array(key.material) });
  });
};

const bounded = (minimum: number, maximum: number) =>
  Schema.Int.check(Schema.isBetween({ minimum, maximum }));

const RemoteConfiguration = Schema.Struct({
  url: Schema.URLFromString.check(
    Schema.makeFilter(
      (url) =>
        url.protocol === "https:" && url.username === "" && url.password === "" && url.hash === "",
    ),
  ),
  cacheTimeMs: bounded(1, 86400000),
  cooldownMs: bounded(0, 3600000),
  timeoutMs: bounded(1, 60000),
  maxResponseBytes: bounded(1, 1048576),
  maxKeys: bounded(1, KeyInput.maxArrayLength),
  maxWaiters: bounded(1, 1024),
});

interface Snapshot {
  readonly keys: KeySet;
  readonly expiresAt: number;
}

type RemoteState =
  | { readonly _tag: "Closed" }
  | {
      readonly _tag: "Open";
      readonly cache: Snapshot | undefined;
      readonly pending: Deferred.Deferred<Snapshot, JwksUnavailable> | undefined;
      readonly lastAttempt: number;
    };

type Admission =
  | { readonly _tag: "Rejected"; readonly reason: "closed" | "cooldown" }
  | { readonly _tag: "Cached"; readonly snapshot: Snapshot }
  | {
      readonly _tag: "Join" | "Start";
      readonly result: Deferred.Deferred<Snapshot, JwksUnavailable>;
    };

/**
 * One trusted HTTPS endpoint per Layer. The supplied client owns egress policy
 * and must not follow redirects; FetchHttpClient is configured to reject them.
 * Responses from another URL are rejected with every client. No stale-on-error
 * fallback, global cache, background polling, or token-supplied key URLs.
 */
export const layerRemote = (
  input: RemoteOptions,
): Layer.Layer<Jwks, JwksUnavailable, HttpClient.HttpClient> => {
  const configuration = {
    cacheTimeMs: 600000,
    cooldownMs: 30000,
    timeoutMs: 5000,
    maxResponseBytes: 131072,
    maxKeys: 64,
    maxWaiters: 64,
    ...input,
  };

  return Layer.effect(
    Jwks,
    Effect.gen(function* () {
      const options = yield* Schema.decodeEffect(RemoteConfiguration)(configuration, {
        reportInput: false,
      }).pipe(Effect.mapError(() => JwksUnavailable.make({ reason: "configuration" })));

      const client = HttpClient.withScope(yield* HttpClient.HttpClient);
      const importKey = makePublicImporter();

      const state = yield* SynchronizedRef.make<RemoteState>({
        _tag: "Open",
        cache: undefined,
        pending: undefined,
        lastAttempt: -Infinity,
      });

      const permits = yield* Semaphore.make(options.maxWaiters);

      const scope = yield* Effect.acquireRelease(Scope.make(), (scope) =>
        Effect.gen(function* () {
          const previous = yield* SynchronizedRef.getAndSet(state, { _tag: "Closed" });

          // A scoped fiber can be interrupted before its first instruction, so
          // its onExit handler alone cannot release pending lookup waiters.
          if (previous._tag === "Open" && previous.pending !== undefined)
            yield* Deferred.fail(previous.pending, JwksUnavailable.make({ reason: "closed" }));
          yield* Scope.close(scope, Exit.void);
        }),
      );

      const fetch = Effect.gen(function* () {
        const response = yield* client.get(options.url.href, {
          headers: { accept: "application/json" },
        });

        if (response.status !== 200 || response.url !== options.url.href)
          return yield* JwksUnavailable.make({ reason: "response" });
        const buffer = new Uint8Array(options.maxResponseBytes);

        const length = yield* Stream.runFoldEffect(
          response.stream,
          () => 0,
          (length, chunk) => {
            if (chunk.byteLength > buffer.length - length)
              return Effect.fail(JwksUnavailable.make({ reason: "response" }));
            buffer.set(chunk, length);

            return Effect.succeed(length + chunk.length);
          },
        );

        const document = yield* json(buffer.subarray(0, length), "payload");
        const keys = yield* readSet(document);

        if (keys.keys.length > options.maxKeys)
          return yield* JwksUnavailable.make({ reason: "response" });

        return {
          keys,
          expiresAt: (yield* Clock.currentTimeMillis) + options.cacheTimeMs,
        } satisfies Snapshot;
      }).pipe(
        Effect.scoped,
        Effect.provideService(FetchHttpClient.RequestInit, {
          // Workers supports manual redirects; the status check above rejects them.
          redirect: "manual",
          credentials: "omit",
        }),
        Effect.catchTag("HttpClientError", () => JwksUnavailable.make({ reason: "transport" })),
        Effect.catchTag(["JoseInvalidToken", "JoseInvalidKey"], () =>
          JwksUnavailable.make({ reason: "response" }),
        ),
        Effect.timeoutOrElse({
          duration: options.timeoutMs,
          orElse: () => JwksUnavailable.make({ reason: "transport" }),
        }),
      );

      const refresh = (missingFrom?: Snapshot) =>
        Effect.uninterruptibleMask((restore) =>
          Effect.gen(function* () {
            const now = yield* restore(Clock.currentTimeMillis);
            const result = yield* Deferred.make<Snapshot, JwksUnavailable>();

            // Recheck cache and ownership together after the caller's snapshot.
            // A missing key bypasses only the snapshot that failed selection.
            const admission = yield* SynchronizedRef.modify(
              state,
              (current): readonly [Admission, RemoteState] => {
                if (current._tag === "Closed")
                  return [{ _tag: "Rejected", reason: "closed" }, current];
                if (
                  current.cache !== undefined &&
                  current.cache !== missingFrom &&
                  current.cache.expiresAt > now
                )
                  return [{ _tag: "Cached", snapshot: current.cache }, current];
                if (current.pending !== undefined)
                  return [{ _tag: "Join", result: current.pending }, current];
                if (now - current.lastAttempt < options.cooldownMs)
                  return [{ _tag: "Rejected", reason: "cooldown" }, current];

                return [
                  { _tag: "Start", result },
                  { ...current, pending: result, lastAttempt: now },
                ];
              },
            );

            if (admission._tag === "Rejected")
              return yield* JwksUnavailable.make({ reason: admission.reason });
            if (admission._tag === "Cached") return admission.snapshot;
            if (admission._tag === "Join") return yield* restore(Deferred.await(admission.result));

            // Admission through fork registration is uninterruptible. Network
            // work and waiter suspension never run under the state lock.
            yield* fetch.pipe(
              Effect.onExit((exit) =>
                SynchronizedRef.updateEffect(state, (current) =>
                  current._tag === "Closed"
                    ? Effect.succeed(current)
                    : Deferred.done(result, exit).pipe(
                        // Keep pending ownership until publication, serialized
                        // with shutdown so a closed owner cannot publish success.
                        Effect.as({
                          ...current,
                          cache: Exit.isSuccess(exit) ? exit.value : current.cache,
                          pending: undefined,
                        }),
                      ),
                ),
              ),
              Effect.forkIn(scope, { uninterruptible: false }),
            );

            return yield* restore(Deferred.await(result));
          }),
        );

      const resolve = Effect.fnUntraced(function* (input: Selection) {
        if ((yield* SynchronizedRef.get(state))._tag === "Closed")
          return yield* JwksUnavailable.make({ reason: "closed" });
        const selection = yield* readSelection(input);
        const now = yield* Clock.currentTimeMillis;
        const snapshot = yield* SynchronizedRef.get(state);

        if (snapshot._tag === "Closed") return yield* JwksUnavailable.make({ reason: "closed" });

        const current =
          snapshot.cache !== undefined && snapshot.cache.expiresAt > now
            ? snapshot.cache
            : yield* refresh();

        const candidate = yield* select(current.keys, selection).pipe(
          Effect.catchTag("JoseKeyNotFound", () =>
            refresh(current).pipe(
              Effect.mapError((error) =>
                error.reason === "cooldown" ? KeyNotFound.make({}) : error,
              ),
              Effect.flatMap((snapshot) => select(snapshot.keys, selection)),
            ),
          ),
        );

        return yield* importKey(candidate, selection.algorithm);
      });

      return Jwks.of({
        resolve: (selection) =>
          resolve(selection).pipe(
            permits.withPermitsIfAvailable(1),
            Effect.flatMap(
              Option.match({
                onNone: () => JwksUnavailable.make({ reason: "busy" }),
                onSome: Effect.succeed,
              }),
            ),
          ),
      });
    }),
  );
};
