import { Effect, Layer, Redacted, Schema } from "effect";
import { HttpClient, HttpClientRequest } from "effect/http";

import type { ProofDeliveryOutcome } from "../proofs/models";
import { SmsDelivery, type SmsMessage } from "./SmsDelivery";
import { TwilioConfig, TwilioConfiguration, TwilioConfigurationError } from "./TwilioConfig";

/** Uses Twilio's Messages REST API. Supply a non-retrying HTTP client.
 * Unknown send outcomes are never retried. Scope aborts/releases every response.
 * Request bodies, credentials, and provider error bodies stay outside telemetry.
 */
export const layer = Layer.effect(
  SmsDelivery,
  Effect.gen(function* () {
    const config = yield* Schema.decodeEffect(TwilioConfiguration)(yield* TwilioConfig).pipe(
      Effect.mapError(() => TwilioConfigurationError.make({})),
    );

    const client = (yield* HttpClient.HttpClient).pipe(HttpClient.withScope);
    const url = `https://api.twilio.com/2010-04-01/Accounts/${config.accountSid}/Messages.json`;

    const send = Effect.fn("Twilio.send")(function* (message: SmsMessage) {
      const request = HttpClientRequest.post(url).pipe(
        HttpClientRequest.basicAuth(config.accountSid, config.authToken),
        HttpClientRequest.bodyUrlParams({
          To: message.to,
          Body: Redacted.value(message.body),
          ...("from" in config
            ? { From: config.from }
            : { MessagingServiceSid: config.messagingServiceSid }),
        }),
      );

      return yield* client.execute(request).pipe(
        Effect.map((response): ProofDeliveryOutcome =>
          response.status === 201
            ? { _tag: "Accepted" }
            : response.status >= 400 && response.status < 500 && response.status !== 408
              ? { _tag: "DefiniteFailure", reason: "unavailable" }
              : { _tag: "Ambiguous" },
        ),
        Effect.scoped,
        Effect.timeout("10 seconds"),
        Effect.catch(() => Effect.succeed<ProofDeliveryOutcome>({ _tag: "Ambiguous" })),
        Effect.provideService(HttpClient.TracerDisabledWhen, () => true),
      );
    });

    return { send };
  }),
);
