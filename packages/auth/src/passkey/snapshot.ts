import { DateTime, Effect, Predicate, Schema } from "effect";

import { PasskeyUnavailable } from "./errors";

export const freezePasskey = (value: unknown): void => {
  if (!Predicate.isObjectOrArray(value) || Object.isFrozen(value)) return;
  if (DateTime.isDateTime(value)) Object.freeze(DateTime.toPartsUtc(value));
  for (const child of Object.values(value)) freezePasskey(child);
  Object.freeze(value);
};

export const snapshotPasskeySync = <S extends Schema.Codec<unknown, unknown, never, never>>(
  schema: S,
  value: S["Type"],
): S["Type"] => {
  try {
    const codec = Schema.toCodecJson(Schema.toType(schema));
    const result = Schema.decodeSync(codec)(Schema.encodeSync(codec)(value));

    freezePasskey(result);

    return result;
  } catch {
    throw PasskeyUnavailable.make({});
  }
};

export const snapshotPasskey = <S extends Schema.Codec<unknown, unknown, never, never>>(
  schema: S,
  value: S["Type"],
) =>
  Effect.try({
    try: () => snapshotPasskeySync(schema, value),
    catch: () => PasskeyUnavailable.make({}),
  });

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
