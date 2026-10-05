import { Context, type Effect, type Redacted } from "effect";

import type { AuthInvocation } from "../operations/context";
import type { AuthenticationEvidence } from "../sessions/models";
import type { TotpActionRequired, TotpUnavailable } from "./errors";
import type { TotpActionChallenge } from "./models";

/** Fresh independent action proof, bound to the exact command. No weaker default exists. */
export class TotpActionEvidence extends Context.Service<
  TotpActionEvidence,
  {
    readonly verify: (input: {
      readonly invocation: AuthInvocation;
      readonly challenge: TotpActionChallenge;
      readonly proof?: Redacted.Redacted<string>;
    }) => Effect.Effect<AuthenticationEvidence, TotpActionRequired | TotpUnavailable>;
  }
>()("effect-auth/TotpActionEvidence") {}
