import { Context, type Effect, Schema } from "effect";

import type { PreparedCommit } from "../hooks/commit";
import { OAuthConnectedRevocationJob } from "./connectedModels";
import type { PrepareOAuthCommit } from "./OAuthSignInPersistence";
import type { OAuthUnavailable } from "./signInErrors";
import type { OAuthModuleId } from "./signInModels";
import { OAuthClaimId, OAuthInstant } from "./signInModels";

export const OAuthConnectedRevocationClaim = Schema.Struct({
  job: OAuthConnectedRevocationJob,
  claimId: OAuthClaimId,
  claimedAtMillis: OAuthInstant,
  claimExpiresAtMillis: OAuthInstant,
});

export type OAuthConnectedRevocationClaim = typeof OAuthConnectedRevocationClaim.Type;

export const OAuthConnectedRevocationDecision = Schema.Union([
  Schema.TaggedStruct("Claimed", { claim: OAuthConnectedRevocationClaim }),
  Schema.TaggedStruct("Empty", {}),
]);

/** Optional durable revocation authority sharing Disconnect's physical store.
 * Claimed attempts never overlap by expired takeover. Unknown outcomes do not
 * authorize automatic retries. Provider-wide revocation can affect authorization
 * obtained after this job; no local ordering fence can retract an external token. */
export class OAuthConnectedRevocations extends Context.Service<
  OAuthConnectedRevocations,
  {
    readonly claim: <A>(
      input: {
        readonly moduleId: typeof OAuthModuleId.Type;
        readonly claimId: typeof OAuthClaimId.Type;
        readonly lifetimeMillis: number;
      },
      prepare: PrepareOAuthCommit<typeof OAuthConnectedRevocationDecision.Type, A>,
    ) => Effect.Effect<PreparedCommit<A>, OAuthUnavailable>;
    readonly settle: <A>(
      input: {
        readonly claim: OAuthConnectedRevocationClaim;
        readonly outcome: "Confirmed" | "Unknown";
      },
      prepare: PrepareOAuthCommit<{ readonly settled: boolean }, A>,
    ) => Effect.Effect<PreparedCommit<A>, OAuthUnavailable>;
  }
>()("effect-auth/OAuthConnectedRevocations") {}
