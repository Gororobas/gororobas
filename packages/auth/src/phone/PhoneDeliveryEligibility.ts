import { Context, type Effect } from "effect";

import type { PhoneNumber, PhoneOtpUnavailable } from "./models";

/** Consumer controls supported numbering ranges, sender/template eligibility and vendor rules. */
export class PhoneDeliveryEligibility extends Context.Service<
  PhoneDeliveryEligibility,
  { readonly allowed: (phoneNumber: PhoneNumber) => Effect.Effect<boolean, PhoneOtpUnavailable> }
>()("effect-auth/PhoneDeliveryEligibility") {}
