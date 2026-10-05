import { Context, type Effect, Schema, type Redacted } from "effect";

import type { PasswordCheckUnavailable } from "./errors";

/** Request-specific local screening hints. Never log these or implicitly send
 * them to a remote breached-password service. Context is not authorization.
 */
export const PasswordScreeningContext = Schema.Struct({
  accountName: Schema.optionalKey(Schema.String.check(Schema.isMaxLength(256))),
  serviceName: Schema.optionalKey(Schema.String.check(Schema.isMaxLength(256))),
});

export type PasswordScreeningContext = typeof PasswordScreeningContext.Type;

export const PasswordScreening = Schema.Union([
  Schema.TaggedStruct("Allowed", {}),
  Schema.TaggedStruct("Rejected", {
    reason: Schema.Literals(["compromised", "common", "contextual"]),
  }),
]);

export type PasswordScreening = typeof PasswordScreening.Type;

/** Required consumer capability for new passwords. No implicit network call or
 * permissive default. Remote adapters must explicitly document any disclosure.
 * A common/compromised corpus and contextual rules belong to this capability.
 */
export class CompromisedPasswords extends Context.Service<
  CompromisedPasswords,
  {
    readonly check: (
      password: Redacted.Redacted<string>,
      context: PasswordScreeningContext,
    ) => Effect.Effect<PasswordScreening, PasswordCheckUnavailable>;
  }
>()("effect-auth/CompromisedPasswords") {}
