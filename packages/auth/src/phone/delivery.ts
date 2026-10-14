import { Effect, Layer, Redacted } from "effect";

import { SmsProofDelivery } from "../proofs/SmsProofDelivery";
import { SmsDelivery } from "../sms/SmsDelivery";
import { Template } from "./Template";

/** Render inside the private, locally once delivery task; the transport never receives proof internals. */
export const deliveryLayer = Layer.unwrap(
  Effect.gen(function* () {
    const delivery = yield* SmsDelivery;
    const template = yield* Template;

    return SmsProofDelivery.layer((message) =>
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
