import { Schema } from "effect"

import { ModerationEventId, PersonId } from "../common/ids.js"
import { NonEmptyTrimmedString, TimestampColumn } from "../common/primitives.js"
import { ClaimId } from "./provenance.js"

/**
 * A community member saying a machine's claim is wrong, and why. It never censors anything: it
 * puts the claim in the moderation queue, grouped with the claim's other disputes, and readers see
 * it's disputed until a moderator settles it by censoring the claim or keeping it.
 */
export const Dispute = Schema.Struct({
  claimId: ClaimId,
  /** Null once the person deletes their account; the dispute still counts. */
  personId: Schema.NullOr(PersonId),
  reason: NonEmptyTrimmedString,
  createdAt: TimestampColumn,
  /** The moderation event that settled it; null while it's open. */
  settledByEventId: Schema.NullOr(ModerationEventId),
})

export type Dispute = typeof Dispute.Type
