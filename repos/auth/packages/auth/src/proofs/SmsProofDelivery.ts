import { Context, type Effect } from "effect";

import {
  type ProofDelivery,
  type ProofDeliveryMessage,
  type ProofVendorPolicy,
  proofDeliveryLayer,
} from "./delivery";
import type { ProofDeliveryOutcome } from "./models";

/** The consumer owns number/country eligibility, sender identity and vendor spend policy. */
export class SmsProofDelivery extends Context.Service<SmsProofDelivery, ProofDelivery>()(
  "effect-auth/SmsProofDelivery",
) {
  static readonly layer = <E, R>(
    vendor: ProofVendorPolicy,
    send: (message: ProofDeliveryMessage) => Effect.Effect<ProofDeliveryOutcome, E, R>,
  ) => proofDeliveryLayer(this, vendor, send);
}
