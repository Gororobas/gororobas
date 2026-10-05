import { Context, DateTime, Effect, Redacted, Schema } from "effect";

import { ProofInstant, ProofPurpose } from "../proofs/models";
import { Locale } from "../Schema";
import type { EmailContent } from "./service";

/** Auth prepares the credential presentation before rendering or sending email. */
export const EmailTemplate = Schema.Struct({
  purpose: ProofPurpose,
  content: Schema.Union([
    Schema.TaggedStruct("Code", { code: Schema.Redacted(Schema.String) }),
    Schema.TaggedStruct("Link", { url: Schema.Redacted(Schema.String) }),
  ]),
  expiresAtMillis: ProofInstant,
  locale: Locale,
});

export type EmailTemplate = typeof EmailTemplate.Type;

/** Optional wording/localization override. Link construction and secret policy stay in Auth.
 * Returned bodies are private. Custom renderers must escape content when producing HTML. */
export const EmailRenderer = Context.Reference<{
  readonly render: (message: EmailTemplate) => Effect.Effect<EmailContent>;
}>("effect-auth/EmailRenderer", {
  defaultValue: () => ({
    render: Effect.fnUntraced(function* (message: EmailTemplate) {
      const now = DateTime.toEpochMillis(yield* DateTime.now);
      const minutes = Math.max(1, Math.ceil((message.expiresAtMillis - now) / 60_000));
      const description = message.purpose === "password-reset" ? "password reset" : "verification";
      const content = message.content;
      const presentation = content._tag === "Code" ? "code" : "link";
      const value = Redacted.value(content._tag === "Code" ? content.code : content.url);

      return {
        subject: `Your ${description} ${presentation}`,
        text: Redacted.make(
          `Your ${description} ${presentation} is ${value}\n\nIt expires in ${minutes} minute${minutes === 1 ? "" : "s"}. If you did not request it, ignore this email.`,
        ),
      };
    }),
  }),
});
