import { Context, Effect, Layer, Schema } from "effect";

import { makeEmailLink } from "../email-delivery/link";
import { EmailRenderer } from "../email-delivery/render";
import { EmailDelivery, EmailMessage } from "../email-delivery/service";
import type { ProofSecretPolicy } from "./crypto";
import { type ProofDelivery, proofDeliveryLayer } from "./delivery";
import { ProofConfigurationError } from "./errors";

/** Internal bridge from proof dispatch to rendered email. Transports never see proof formats. */
export class EmailProofDelivery extends Context.Service<EmailProofDelivery, ProofDelivery>()(
  "effect-auth/internal/EmailProofDelivery",
) {}

export const emailProofDeliveryLayer = (options: {
  readonly secret: ProofSecretPolicy;
  readonly url?: string;
}) =>
  Layer.unwrap(
    Effect.gen(function* () {
      const delivery = yield* EmailDelivery;
      const renderer = yield* EmailRenderer;

      const link =
        options.secret._tag === "Token" ? yield* makeEmailLink(options.url ?? "") : undefined;

      return proofDeliveryLayer(
        EmailProofDelivery,
        // A plain email transport promises no delivery-ID deduplication.
        { vendorId: "email", idempotencyMillis: 0 },
        Effect.fnUntraced(function* (message) {
          if (message.recipient.namespace !== "email")
            return { _tag: "DefiniteFailure", reason: "policy" } as const;

          const content =
            message.format === "numeric-code"
              ? { _tag: "Code" as const, code: message.secret }
              : link === undefined
                ? yield* ProofConfigurationError.make({ reason: "delivery" })
                : { _tag: "Link" as const, url: yield* link(message) };

          const rendered = yield* renderer.render({
            purpose: message.purpose,
            content,
            expiresAtMillis: message.expiresAtMillis,
            locale: message.locale,
          });

          const email = yield* Schema.decodeEffect(EmailMessage)({
            ...rendered,
            to: message.recipient.value,
          });

          return yield* Effect.suspend(() => delivery.send(email)).pipe(
            // Provider exceptions can contain cleartext bodies and capability URLs.
            Effect.withTracerEnabled(false),
            Effect.as({ _tag: "Accepted" } as const),
            Effect.catchTags({
              EmailNotAccepted: () =>
                Effect.succeed({ _tag: "DefiniteFailure", reason: "unavailable" } as const),
              EmailAcceptanceUnknown: () => Effect.succeed({ _tag: "Ambiguous" } as const),
            }),
          );
        }),
      );
    }),
  );
