import type { Effect } from "effect";
import { Context, Schema } from "effect";

import { Email } from "../Schema";

/** Already-rendered private content. Unwrap bodies only at the provider boundary. */
export const EmailContent = Schema.Struct({
  subject: Schema.NonEmptyString,
  text: Schema.Redacted(Schema.String),
  html: Schema.optionalKey(Schema.Redacted(Schema.String)),
});

export type EmailContent = typeof EmailContent.Type;

export const EmailMessage = Schema.Struct({ to: Email, ...EmailContent.fields });
export type EmailMessage = typeof EmailMessage.Type;

/** The provider definitely did not accept the message. No provider diagnostics escape. */
export class EmailNotAccepted extends Schema.TaggedError<EmailNotAccepted>()(
  "EmailNotAccepted",
  {},
) {}

/** The send may have been accepted. This does not authorize a retry. */
export class EmailAcceptanceUnknown extends Schema.TaggedError<EmailAcceptanceUnknown>()(
  "EmailAcceptanceUnknown",
  {},
) {}

/** Application-supplied transport. Success means provider acceptance, not inbox delivery.
 * Do not retry internally. Defects and interruption must remain failed effects.
 * Sender identity, provider configuration and provider error mapping belong here. */
export class EmailDelivery extends Context.Service<
  EmailDelivery,
  {
    readonly send: (
      message: EmailMessage,
    ) => Effect.Effect<void, EmailNotAccepted | EmailAcceptanceUnknown>;
  }
>()("effect-auth/EmailDelivery") {}
