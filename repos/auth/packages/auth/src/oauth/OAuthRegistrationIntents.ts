import { Context, Schema, type Effect } from "effect";

import type { PreparedCommit } from "../hooks/commit";
import type { PrepareOAuthCommit } from "./OAuthSignInPersistence";
import { OAuthRegistrationIntent } from "./registrationModels";
import type { OAuthUnavailable } from "./signInErrors";
import {
  OAuthSettlementDecision,
  type OAuthClaim,
  type OAuthVerifiedExternalIdentity,
} from "./signInModels";

export const OAuthRegistrationSettlement = Schema.Union([
  OAuthSettlementDecision,
  Schema.TaggedStruct("RegistrationIssued", { intent: OAuthRegistrationIntent }),
]);

export type OAuthRegistrationSettlement = typeof OAuthRegistrationSettlement.Type;

/** Optional replacement for VERIFIED sign-in settlement, under the same flow and
 * identity authority. Existing active credentials sign in. Only a globally unowned,
 * currently permitted and unreserved full tuple may create the exact supplied restricted intent.
 * Connected-only, disabled or otherwise owned identities never count as unknown.
 * Exact claim/context/deadline CAS, terminal erasure, unique intent/reference,
 * ownership check, and the prepared decision commit together. No provisioning.
 * If intent is absent/expired, unknown identity commits Rejected. Retain original
 * binder and immutable time horizons. Unknown outcomes discard every receipt.
 */
export class OAuthRegistrationIntents extends Context.Service<
  OAuthRegistrationIntents,
  {
    readonly settle: <A>(
      input: {
        readonly claim: OAuthClaim;
        readonly identity: OAuthVerifiedExternalIdentity;
        readonly intent?: OAuthRegistrationIntent;
        readonly nowMillis: number;
      },
      prepare: PrepareOAuthCommit<OAuthRegistrationSettlement, A>,
    ) => Effect.Effect<PreparedCommit<A>, OAuthUnavailable>;
  }
>()("effect-auth/OAuthRegistrationIntents") {}
