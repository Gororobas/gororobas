import { Signature } from "@yielded/crypto/Signature";
import {
  Cause,
  Clock,
  Context,
  Effect,
  Exit,
  Fiber,
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

interface Pending {
  readonly result: Promise<Exit.Exit<Snapshot, JwksUnavailable>>;
  readonly complete: (exit: Exit.Exit<Snapshot, JwksUnavailable>) => void;
  // Waiter ownership changes under the remote state lock. The starting waiter
  // cannot release its ownership until the scoped fiber has been registered.
  waiters: number;
  stopping: boolean;
  fiber: Fiber.Fiber<Snapshot, JwksUnavailable> | undefined;
}

type RemoteState =
  | { readonly _tag: "Closed" }
  | {
      readonly _tag: "Open";
      readonly cache: Snapshot | undefined;
      readonly pending: Pending | undefined;
      readonly lastAttempt: number;
    };

type Admission =
  | { readonly _tag: "Rejected"; readonly reason: "closed" | "cooldown" | "busy" }
  | { readonly _tag: "Cached"; readonly snapshot: Snapshot }
  | {
      readonly _tag: "Join" | "Start";
      readonly pending: Pending;
    };

/**
 * One trusted HTTPS endpoint per Layer. The supplied client owns egress policy
 * and must not follow redirects; FetchHttpClient is configured to reject them.
 * Responses from another URL are rejected with every client. No stale-on-error
 * fallback, global cache, background polling, or token-supplied key URLs.
 * The last departing waiter cancels and joins its refresh. New refresh lookups
 * receive busy until that cleanup finishes; cancellation never starts a retry.
 * Owner closure releases lookups as unavailable; unexpected refresh cleanup
 * failures propagate through the owning Scope with their complete Cause.
 * The host must retain the initiating request's I/O lifetime during shared work;
 * on Workers, use waitUntil with bounded verification at the request boundary.
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
      let closingFailure: Cause.Cause<JwksUnavailable> | undefined;

      const scope = yield* Effect.acquireRelease(Scope.make(), (scope) =>
        Effect.gen(function* () {
          const previous = yield* SynchronizedRef.getAndSet(state, { _tag: "Closed" });

          // A scoped fiber can be interrupted before its first instruction, so
          // its onExit handler alone cannot release pending lookup waiters.
          if (previous._tag === "Open" && previous.pending !== undefined)
            previous.pending.complete(Exit.fail(JwksUnavailable.make({ reason: "closed" })));
          yield* Scope.close(scope, Exit.void);
          // Scope finalizers cannot fail in E. Preserve the whole unexpected
          // cleanup Cause as a defect, including when all waiters cancelled.
          if (closingFailure !== undefined) return yield* Effect.die(closingFailure);
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
        Effect.catchCause((cause) =>
          Effect.failCause(
            Cause.map(cause, (error) =>
              error._tag === "HttpClientError"
                ? JwksUnavailable.make({ reason: "transport" })
                : error._tag === "JoseInvalidToken" || error._tag === "JoseInvalidKey"
                  ? JwksUnavailable.make({ reason: "response" })
                  : error,
            ),
          ),
        ),
        (effect) =>
          Effect.suspend(() => {
            let failure: Cause.Cause<JwksUnavailable> | undefined;

            return effect.pipe(
              // Retain the joined request's cleanup failure across the timeout race.
              Effect.onExit((exit) =>
                Effect.sync(() => {
                  if (Exit.isFailure(exit) && !Cause.hasInterruptsOnly(exit.cause))
                    failure = exit.cause;
                }),
              ),
              Effect.timeoutOrElse({
                duration: options.timeoutMs,
                orElse: () =>
                  Effect.failCause(
                    failure === undefined
                      ? Cause.fail(JwksUnavailable.make({ reason: "transport" }))
                      : Cause.combine(
                          Cause.fail(JwksUnavailable.make({ reason: "transport" })),
                          failure,
                        ),
                  ),
              }),
              Effect.onInterrupt(() =>
                failure === undefined ? Effect.void : Effect.failCause(failure),
              ),
            );
          }),
      );

      const refresh = (missingFrom?: Snapshot) =>
        Effect.uninterruptibleMask((restore) =>
          Effect.gen(function* () {
            const now = yield* restore(Clock.currentTimeMillis);
            let delivered = false;

            return yield* Effect.acquireUseRelease(
              Effect.gen(function* () {
                // A native shared promise lets request-isolated runtimes track
                // the dependency and resume each waiter in its own I/O context.
                let complete!: Pending["complete"];

                const result = new Promise<Exit.Exit<Snapshot, JwksUnavailable>>((resolve) => {
                  complete = resolve;
                });

                // Recheck cache, ownership and waiter admission together. A missing
                // key bypasses only the snapshot that failed selection.
                const admission = yield* SynchronizedRef.modify(
                  state,
                  (current): readonly [Admission, RemoteState] => {
                    if (current._tag === "Closed")
                      return [{ _tag: "Rejected", reason: "closed" }, current];
                    if (current.pending?.stopping)
                      return [{ _tag: "Rejected", reason: "busy" }, current];
                    if (
                      current.cache !== undefined &&
                      current.cache !== missingFrom &&
                      current.cache.expiresAt > now
                    )
                      return [{ _tag: "Cached", snapshot: current.cache }, current];
                    if (current.pending !== undefined) {
                      current.pending.waiters++;

                      return [{ _tag: "Join", pending: current.pending }, current];
                    }
                    if (now - current.lastAttempt < options.cooldownMs)
                      return [{ _tag: "Rejected", reason: "cooldown" }, current];

                    const pending: Pending = {
                      result,
                      complete,
                      waiters: 1,
                      stopping: false,
                      fiber: undefined,
                    };

                    return [
                      { _tag: "Start", pending },
                      { ...current, pending, lastAttempt: now },
                    ];
                  },
                );

                if (admission._tag === "Start") {
                  const pending = admission.pending;

                  // Admission through fork registration is uninterruptible.
                  // Network work and waiter suspension never hold the state lock.
                  pending.fiber = yield* fetch.pipe(
                    Effect.onExit((exit) =>
                      SynchronizedRef.updateEffect(state, (current) =>
                        current._tag === "Closed"
                          ? Effect.sync(() => {
                              if (Exit.isFailure(exit) && !Cause.hasInterruptsOnly(exit.cause))
                                closingFailure = exit.cause;

                              return current;
                            })
                          : Effect.sync(() => pending.complete(exit)).pipe(
                              // A stopping generation remains registered until
                              // its last waiter has joined the complete child Exit.
                              Effect.as({
                                ...current,
                                cache:
                                  !pending.stopping && Exit.isSuccess(exit)
                                    ? exit.value
                                    : current.cache,
                                pending: pending.stopping ? pending : undefined,
                              }),
                            ),
                      ),
                    ),
                    Effect.forkIn(scope, { uninterruptible: false }),
                  );
                }

                return admission;
              }),
              (admission) => {
                if (admission._tag === "Rejected")
                  return Effect.fail(JwksUnavailable.make({ reason: admission.reason }));
                if (admission._tag === "Cached") return Effect.succeed(admission.snapshot);

                return Effect.gen(function* () {
                  const exit = yield* restore(Effect.promise(() => admission.pending.result));

                  delivered = true;

                  return yield* exit;
                });
              },
              (admission) => {
                if (admission._tag !== "Start" && admission._tag !== "Join") return Effect.void;
                const pending = admission.pending;

                return Effect.gen(function* () {
                  const last = yield* SynchronizedRef.modify(state, (current) => {
                    pending.waiters--;
                    if (pending.waiters !== 0) return [false, current] as const;
                    pending.stopping = true;

                    return [true, current] as const;
                  });

                  const fiber = pending.fiber;

                  if (!last || fiber === undefined) return;
                  // Joining outside the lock lets the child publish its full Exit.
                  yield* Fiber.interrupt(fiber);
                  const exit = yield* Fiber.await(fiber);

                  yield* SynchronizedRef.update(state, (current) =>
                    current._tag === "Open" && current.pending === pending
                      ? { ...current, pending: undefined }
                      : current,
                  );
                  if (!delivered && Exit.isFailure(exit) && !Cause.hasInterruptsOnly(exit.cause))
                    return yield* Effect.failCause(exit.cause);
                });
              },
            );
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
              Effect.catchCause((cause) =>
                Effect.failCause(
                  Cause.map(cause, (error) =>
                    error.reason === "cooldown" ? KeyNotFound.make({}) : error,
                  ),
                ),
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
