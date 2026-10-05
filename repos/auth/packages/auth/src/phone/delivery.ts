import { Effect, Layer, Redacted } from "effect";

import { SmsProofDelivery } from "../proofs/SmsProofDelivery";
import { SmsDelivery } from "../sms/SmsDelivery";
import { Template } from "./Template";

/** Render inside the durable delivery claim; the transport never receives proof internals. */
export const deliveryLayer = Layer.unwrap(
  Effect.gen(function* () {
    const delivery = yield* SmsDelivery;
    const template = yield* Template;

    return SmsProofDelivery.layer({ vendorId: "sms", idempotencyMillis: 0 }, (message) =>
      Effect.suspend(() =>
        delivery.send({
          id: message.deliveryId,
          to: message.recipient.value,
          body: Redacted.make(template.render(Redacted.value(message.secret), message)),
        }),
      ),
    );
  }),
);
