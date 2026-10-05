import type { Schema } from "effect";

import { makeSessionModule } from "./module";

/** Standalone session contracts. Auth definitions bind these automatically. */
export function make<Claims extends Schema.Codec<unknown, unknown, unknown, unknown>>(
  claims: Claims,
): ReturnType<typeof makeSessionModule<"effect-auth/sessions", Claims>>;

export function make<
  Claims extends Schema.Codec<unknown, unknown, unknown, unknown>,
  const Id extends string,
>(
  claims: Claims,
  options: { readonly namespace: Id },
): ReturnType<typeof makeSessionModule<Id, Claims>>;

export function make<
  Claims extends Schema.Codec<unknown, unknown, unknown, unknown>,
  const Id extends string,
>(claims: Claims, options?: { readonly namespace: Id }) {
  if (options === undefined) return makeSessionModule("effect-auth/sessions", claims);

  return makeSessionModule(options.namespace, claims);
}
