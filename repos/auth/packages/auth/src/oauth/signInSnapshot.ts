import { DateTime, Effect, Predicate, Schema } from "effect";

import { OAuthUnavailable } from "./signInErrors";

/** Freeze a detached, validated graph before retaining it or passing it to a
 * callback. This does not validate or copy input; use snapshotOAuth to do both. */
export const freezeOAuth = (value: unknown): void => {
  if (!Predicate.isObjectOrArray(value) || Object.isFrozen(value)) return;
  if (DateTime.isDateTime(value)) Object.freeze(DateTime.toPartsUtc(value));
  for (const child of Object.values(value)) freezeOAuth(child);
  Object.freeze(value);
};

export const snapshotOAuthSync = <S extends Schema.Codec<unknown, unknown, never, never>>(
  schema: S,
  value: S["Type"],
): S["Type"] => {
  try {
    // JSON fields can otherwise retain nested input references through validation.
    const codec = Schema.fromJsonString(Schema.toCodecJson(Schema.toType(schema)));
    const result = Schema.decodeSync(codec)(Schema.encodeSync(codec)(value));

    freezeOAuth(result);

    return result;
  } catch {
    throw OAuthUnavailable.make({});
  }
};

export const snapshotOAuth = <S extends Schema.Codec<unknown, unknown, never, never>>(
  schema: S,
  value: S["Type"],
) =>
  Effect.try({
    try: () => snapshotOAuthSync(schema, value),
    catch: () => OAuthUnavailable.make({}),
  });
