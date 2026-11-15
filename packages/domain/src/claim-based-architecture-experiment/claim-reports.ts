import { Schema } from "effect"

import { ModerationEventId, PersonId } from "../common/ids.js"
import { NonEmptyTrimmedString, TimestampColumn } from "../common/primitives.js"
import { ClaimId } from "./provenance.js"

export const ClaimReportId = Schema.String.pipe(Schema.brand("ClaimReportId"))
export type ClaimReportId = typeof ClaimReportId.Type

/**
 * Why a claim shouldn't show at all. Disagreeing isn't one: on a situated property, disagreeing
 * is making your own claim, and on a canonical one it's proposing a correction.
 */
export const ClaimReportReason = Schema.Literals([
  /** Knowingly false: vandalism, not a different experience. */
  "FALSE",
  "ABUSIVE",
  "SPAM",
  /** About another article, or not about the property at all. */
  "OFF_TOPIC",
  /** Could hurt someone who follows it: eating a toxic part, a dangerous dose. */
  "DANGEROUS",
])

export type ClaimReportReason = typeof ClaimReportReason.Type

/**
 * Someone saying a claim is false or abusive. It lives outside the claim and never hides it by
 * itself: it puts the claim in the moderation queue, grouped with the claim's other reports, and
 * a moderator settles them together by censoring the claim (its `moderationStatus`) or keeping it.
 * Any visible claim can be reported, a person's or a source's, canonical or situated.
 */
export const ClaimReport = Schema.Struct({
  id: ClaimReportId,
  claimId: ClaimId,
  /** Null once the person deletes their account; the report still counts. */
  reporterId: Schema.NullOr(PersonId),
  reason: ClaimReportReason,
  note: Schema.NullOr(NonEmptyTrimmedString),
  createdAt: TimestampColumn,
  /** The moderation event that settled it; null while it's open. */
  settledByEventId: Schema.NullOr(ModerationEventId),
})

export type ClaimReport = typeof ClaimReport.Type
