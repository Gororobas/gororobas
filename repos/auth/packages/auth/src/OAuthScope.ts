import { Schema } from "effect";

const validScope = Schema.isPattern(/^[\x21\x23-\x5B\x5D-\x7E]{1,128}$/);
const brand = Schema.brand("effect-auth/OAuthScope");

/** A validated OAuth scope. Wire values remain strings. */
export const OAuthScope = Schema.String.check(validScope).pipe(brand);

export type OAuthScope<Name extends string = string> = Name & typeof OAuthScope.Type;

/** Declare a scope while preserving its literal name and nominal type. */
export const make = <const Name extends string>(name: Name): OAuthScope<Name> =>
  Schema.Literal(name).check(validScope).pipe(brand).make(name);
