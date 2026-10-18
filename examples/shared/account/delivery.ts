import { EmailDelivery, Schema as AuthSchema } from "@yielded/auth";
import { markAuthFailureReported, reportAuthFailure } from "@yielded/auth/Persistence";
import { Cause, Config, Effect, Layer, Redacted, Schema } from "effect";
import { HttpClient, HttpClientRequest, HttpClientResponse } from "effect/http";

const SendResponse = Schema.Struct({
  success: Schema.Literal(true),
  result: Schema.Struct({
    delivered: Schema.Array(Schema.String),
    queued: Schema.Array(Schema.String),
    permanent_bounces: Schema.Array(Schema.String),
    suppressed_recipients: Schema.optionalKey(Schema.Array(Schema.String)),
  }),
});

/** Keep provider and cleanup failures private until the delivery outcome boundary. */
export const deliveryBoundary = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  Effect.uninterruptibleMask((restore) =>
    restore(effect).pipe(
      Effect.catchCause((cause) => {
        const unexpected = cause.reasons.filter(
          (reason) =>
            Cause.isDieReason(reason) ||
            (Cause.isFailReason(reason) &&
              !Schema.is(EmailDelivery.EmailNotAccepted)(reason.error)),
        );

        const projected = Cause.fromReasons(
          cause.reasons.map((reason) =>
            Cause.isInterruptReason(reason)
              ? reason
              : Cause.makeFailReason(
                  Cause.isFailReason(reason) &&
                    Schema.is(EmailDelivery.EmailNotAccepted)(reason.error)
                    ? reason.error
                    : EmailDelivery.EmailAcceptanceUnknown.make({}),
                ),
          ),
        );

        return (
          unexpected.length === 0
            ? Effect.void
            : reportAuthFailure("proof-delivery", Cause.fromReasons(unexpected))
        ).pipe(
          Effect.andThen(
            Effect.failCause(
              unexpected.length === 0 ? projected : markAuthFailureReported(projected),
            ),
          ),
        );
      }),
    ),
  );

// Cloudflare REST sending works with the local Bun server; no Worker binding is needed.
export const DeliveryLive = Layer.unwrap(
  Effect.gen(function* () {
    const accountId = yield* Config.String("CLOUDFLARE_ACCOUNT_ID");
    const token = yield* Config.Redacted("CLOUDFLARE_API_TOKEN");

    const from = yield* Config.String("AUTH_EMAIL_FROM").pipe(
      Config.withDefault("hello@effect-agent.com"),
    );

    yield* Schema.decodeEffect(Schema.String.check(Schema.isPattern(/^[a-f0-9]{32}$/)))(accountId);
    const sender = yield* Schema.decodeEffect(AuthSchema.Email)(from);
    const client = (yield* HttpClient.HttpClient).pipe(HttpClient.withScope);

    const send = Effect.fn("Customers.sendEmail")(function* (
      message: EmailDelivery.EmailMessage,
    ): Effect.fn.Return<
      void,
      EmailDelivery.EmailNotAccepted | EmailDelivery.EmailAcceptanceUnknown
    > {
      const result = yield* HttpClientRequest.post(
        `https://api.cloudflare.com/client/v4/accounts/${accountId}/email/sending/send`,
      ).pipe(
        HttpClientRequest.bearerToken(token),
        HttpClientRequest.acceptJson,
        HttpClientRequest.bodyJsonUnsafe({
          from: sender,
          to: message.to,
          subject: message.subject,
          text: Redacted.value(message.text),
          ...(message.html === undefined ? {} : { html: Redacted.value(message.html) }),
        }),
        client.execute,
        Effect.flatMap((response) =>
          Effect.gen(function* () {
            if (response.status >= 400 && response.status < 500) {
              return yield* EmailDelivery.EmailNotAccepted.make({});
            }
            if (response.status < 200 || response.status >= 300)
              return yield* EmailDelivery.EmailAcceptanceUnknown.make({});
            const body = yield* HttpClientResponse.schemaBodyJson(SendResponse)(response);

            if (
              body.result.delivered.includes(message.to) ||
              body.result.queued.includes(message.to)
            )
              return;
            if (
              body.result.permanent_bounces.includes(message.to) ||
              body.result.suppressed_recipients?.includes(message.to)
            )
              return yield* EmailDelivery.EmailNotAccepted.make({});

            return yield* EmailDelivery.EmailAcceptanceUnknown.make({});
          }),
        ),
        Effect.timeout("8 seconds"),
        Effect.scoped,
        Effect.provideService(HttpClient.TracerDisabledWhen, () => true),
        deliveryBoundary,
      );

      return result;
    });

    // Cloudflare does not promise delivery-ID deduplication. Never retry an uncertain send.
    return Layer.succeed(EmailDelivery.EmailDelivery, { send });
  }),
);
