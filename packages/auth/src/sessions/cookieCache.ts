import { Context, Crypto, DateTime, Effect, Redacted, Schema, type Types } from "effect";
import { Base64Url } from "effect/encoding";

import { reportAuthFailure } from "../internal/diagnostics";
import { AuthenticationClock } from "../operations/clock";
import type { AuthCredentialCommand } from "../operations/credentials";
import { makeSessionSigningCodec, SessionSigningKeys } from "./crypto";
import { SessionInvalid, SessionUnavailable } from "./errors";
import type { SessionMetadata } from "./models";
import { type SessionPolicy, validateSessionTimeline } from "./policy";

export type SessionCacheCommand = AuthCredentialCommand & { readonly slot: "session-cache" };

export const sessionCacheTransport = Symbol("effect-auth/session-cache-transport");

export interface SessionCacheTransport {
  readonly rotate: Effect.Effect<Redacted.Redacted<string>, SessionUnavailable>;
  readonly lifetimeMillis: number;
}

export type SessionCacheOwner = {
  readonly [sessionCacheTransport]?: SessionCacheTransport;
};

export const SessionCacheGeneration = Schema.String.check(Schema.isPattern(/^[A-Za-z0-9_-]{43}$/));

/** Private implementation; only configured Auth Layers install it. */
export interface SessionCookieCache<Session> {
  readonly transport: SessionCacheTransport;
  readonly read: (
    credential: Redacted.Redacted<string>,
    cached: Redacted.Redacted<string>,
    generation: Redacted.Redacted<string>,
  ) => Effect.Effect<Session, SessionInvalid | SessionUnavailable>;
  readonly write: (
    credential: Redacted.Redacted<string>,
    session: Session,
    checkedAt: DateTime.Utc,
    generation: Redacted.Redacted<string>,
  ) => Effect.Effect<SessionCacheCommand, SessionUnavailable>;
}

interface CacheService<Id extends string, Session> {
  readonly moduleId: Id;
  readonly session: Types.Invariant<Session>;
}

export const sessionCookieCache = <Id extends string, Session>(moduleId: Id) =>
  Context.Service<CacheService<Id, Session>, SessionCookieCache<Session>>(
    `effect-auth/sessions/${moduleId}/CookieCache`,
  );

/** A signed cookie avoids a storage lookup only for the explicitly configured window. */
export const makeSessionCookieCache = Effect.fnUntraced(function* <
  S extends Schema.Codec<SessionMetadata, unknown, unknown, unknown>,
>(moduleId: string, sessionSchema: S, policy: SessionPolicy) {
  const maximumAge = policy.positiveCacheMillis ?? 0;
  const clockPolicy = yield* AuthenticationClock;

  const SessionCodec: Schema.Codec<
    S["Type"],
    S["Encoded"],
    S["DecodingServices"],
    S["EncodingServices"]
  > = sessionSchema;

  const Envelope = Schema.Struct({
    purpose: Schema.Literal("effect-auth/session-cache"),
    moduleId: Schema.Literal(moduleId),
    issuer: Schema.Literal(policy.issuer),
    audience: Schema.Literal(policy.audience),
    generation: Schema.Literal(policy.generation),
    requestGeneration: SessionCacheGeneration,
    credentialDigest: Schema.String,
    cachedAt: Schema.DateTimeUtcFromMillis,
    expiresAt: Schema.DateTimeUtcFromMillis,
    session: SessionCodec,
  });

  const signing = yield* makeSessionSigningCodec(
    Envelope,
    yield* SessionSigningKeys,
    Math.min(policy.maximumTokenBytes, 3072),
    "session-cache",
  );

  const crypto = yield* Crypto.Crypto;
  const encoder = new TextEncoder();

  const digest = (credential: Redacted.Redacted<string>) =>
    crypto.digest("SHA-256", encoder.encode(Redacted.value(credential))).pipe(
      Effect.tapCause((cause) => reportAuthFailure("session-crypto", cause)),
      Effect.map(Base64Url.encode),
      Effect.mapError(() => SessionUnavailable.make({})),
    );

  return {
    transport: {
      lifetimeMillis: policy.maximumIssuedAbsoluteLifetimeMillis,
      rotate: crypto.randomBytes(32).pipe(
        Effect.tapCause((cause) => reportAuthFailure("session-crypto", cause)),
        Effect.map((bytes) => Redacted.make(Base64Url.encode(bytes))),
        Effect.mapError(() => SessionUnavailable.make({})),
      ),
    },
    read: Effect.fnUntraced(function* (
      credential: Redacted.Redacted<string>,
      cached: Redacted.Redacted<string>,
      generation: Redacted.Redacted<string>,
    ) {
      const envelope = yield* signing.decode(cached);
      const credentialDigest = yield* digest(credential);
      const now = DateTime.toEpochMillis(yield* DateTime.now);
      const cachedAt = DateTime.toEpochMillis(envelope.cachedAt);
      const expiresAt = DateTime.toEpochMillis(envelope.expiresAt);

      if (
        maximumAge <= 0 ||
        cachedAt - now > clockPolicy.futureToleranceMillis ||
        expiresAt <= now ||
        expiresAt <= cachedAt ||
        expiresAt - cachedAt > maximumAge ||
        envelope.credentialDigest !== credentialDigest ||
        envelope.requestGeneration !== Redacted.value(generation)
      )
        return yield* SessionInvalid.make({});
      yield* validateSessionTimeline(envelope.session, policy).pipe(
        Effect.provideService(AuthenticationClock, clockPolicy),
      );

      return envelope.session;
    }),
    write: Effect.fnUntraced(function* (
      credential: Redacted.Redacted<string>,
      session: S["Type"],
      checkedAt: DateTime.Utc,
      generation: Redacted.Redacted<string>,
    ) {
      const now = yield* DateTime.now;

      const expiresAtMillis = Math.min(
        DateTime.toEpochMillis(checkedAt) + maximumAge,
        DateTime.toEpochMillis(session.expiresAt),
        DateTime.toEpochMillis(session.absoluteExpiresAt),
      );

      if (expiresAtMillis <= DateTime.toEpochMillis(now)) return yield* SessionUnavailable.make({});

      const cached = yield* signing.encode({
        purpose: "effect-auth/session-cache",
        moduleId,
        issuer: policy.issuer,
        audience: policy.audience,
        generation: policy.generation,
        requestGeneration: Redacted.value(generation),
        credentialDigest: yield* digest(credential),
        cachedAt: checkedAt,
        expiresAt: DateTime.makeUnsafe(expiresAtMillis),
        session,
      });

      return {
        _tag: "Issue" as const,
        slot: "session-cache" as const,
        credential: cached,
        expiresAtMillis,
      };
    }),
  } satisfies SessionCookieCache<S["Type"]>;
});
