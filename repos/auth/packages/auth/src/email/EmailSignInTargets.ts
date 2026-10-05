import { Context, type Effect, type Option } from "effect";

import type { LoginIdentifier } from "../identity/models";
import type { EmailUnavailable } from "./errors";
import type { EmailCredentialSnapshot } from "./models";

/** Active subject + verified exact identifier + active configured email credential.
 * Capture their SAME revisions before verification; absent/ineligible returns None.
 * Every identifier change invalidating captured login bumps subject securityRevision
 * atomically because AuthenticationRevision does not contain identifierRevision.
 */
export class EmailSignInTargets extends Context.Service<
  EmailSignInTargets,
  {
    readonly lookup: (input: {
      readonly moduleId: string;
      readonly identifier: LoginIdentifier;
    }) => Effect.Effect<Option.Option<EmailCredentialSnapshot>, EmailUnavailable>;
  }
>()("effect-auth/EmailSignInTargets") {}
