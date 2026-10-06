import { Config, Effect, Layer } from "effect"

import { EmailDeliveryMailpit } from "./emails/email-delivery-mailpit.js"
import { EmailDeliveryResend } from "./emails/email-delivery-resend.js"
import { IdGenLive } from "./id-gen-live.js"

export const ServerServicesLive = Layer.mergeAll(
  IdGenLive,
  Layer.unwrap(
    Effect.map(
      Config.Literals(["development", "test", "production"], "NODE_ENV").pipe(
        Config.withDefault("development"),
      ),
      (environment) => (environment === "production" ? EmailDeliveryResend : EmailDeliveryMailpit),
    ),
  ),
)
