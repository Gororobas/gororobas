import { Context, type Effect } from "effect";

import type { PhoneOtpUnavailable } from "./models";

/** Distributed reservation, including suppressed recipients and failed/ambiguous sends.
 * Identical request fingerprints may reuse admission, never a new message budget.
 * Core ProofPersistence separately owns identifier/subject/resend/guess limits. */
export class PhoneAdmission extends Context.Service<
  PhoneAdmission,
  {
    readonly admit: (input: {
      readonly moduleId: string;
      readonly action: "request" | "attempt";
      readonly requestId: string;
      readonly fingerprint: string;
      readonly networkKey: string;
      /** At most the shared proof request retention; zero disables replay admission. */
      readonly replayLifetimeMillis: number;
    }) => Effect.Effect<boolean, PhoneOtpUnavailable>;
    readonly cleanup: (input: {
      readonly moduleId: string;
      readonly limit: number;
      readonly after?: string;
    }) => Effect.Effect<
      { readonly deleted: number; readonly nextCursor: string | null },
      PhoneOtpUnavailable
    >;
  }
>()("effect-auth/PhoneAdmission") {}
