import { Effect, Layer } from "effect"

import { EmailDeliveryMailpit } from "./emails/email-delivery-mailpit.js"
import { EmailDeliveryResend } from "./emails/email-delivery-resend.js"
import { environmentConfig } from "./environment-config.js"
import { IdGenLive } from "./id-gen-live.js"

export const ServerServicesLive = Layer.mergeAll(
  IdGenLive,
  Layer.unwrap(
    Effect.map(environmentConfig, (environment) =>
      environment === "production" ? EmailDeliveryResend : EmailDeliveryMailpit,
    ),
  ),
)
