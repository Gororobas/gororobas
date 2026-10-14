import { DateTime, Effect, Predicate, Result, Schema } from "effect";

import { PasskeyUnavailable } from "./errors";

export const freezePasskey = (value: unknown): void => {
  if (!Predicate.isObjectOrArray(value) || Object.isFrozen(value)) return;
  if (DateTime.isDateTime(value)) Object.freeze(DateTime.toPartsUtc(value));
  for (const child of Object.values(value)) freezePasskey(child);
  Object.freeze(value);
};

export const snapshotPasskeyResult = <S extends Schema.Codec<unknown, unknown, never, never>>(
  schema: S,
  value: S["Type"],
) =>
  Result.try({
    try: () => {
      const codec = Schema.toCodecJson(Schema.toType(schema));
      const result = Schema.decodeSync(codec)(Schema.encodeSync(codec)(value));

      freezePasskey(result);

      return result;
    },
    catch: () => PasskeyUnavailable.make({}),
  });

export const snapshotPasskeySync = <S extends Schema.Codec<unknown, unknown, never, never>>(
  schema: S,
  value: S["Type"],
): S["Type"] => {
  const result = snapshotPasskeyResult(schema, value);

  if (Result.isFailure(result)) {
    // oxlint-disable-next-line effect/no-untyped-throw -- Native persistence prepare callbacks require synchronous rejection before physical commit; workflows use snapshotPasskey.
    throw result.failure;
  }

  return result.success;
};

export const snapshotPasskey = <S extends Schema.Codec<unknown, unknown, never, never>>(
  schema: S,
  value: S["Type"],
) => Effect.suspend(() => Effect.fromResult(snapshotPasskeyResult(schema, value)));

export const samePasskey = <S extends Schema.Codec<unknown, unknown, never, never>>(
  schema: S,
  left: S["Type"],
  right: S["Type"],
) =>
  Effect.gen(function* () {
    const codec = Schema.fromJsonString(Schema.toCodecJson(Schema.toType(schema)));
    const a = yield* Schema.encodeEffect(codec)(left);
    const b = yield* Schema.encodeEffect(codec)(right);

    return a === b;
  }).pipe(Effect.mapError(() => PasskeyUnavailable.make({})));
