/**
 * Moderation of community content.
 *
 * Publications, publication comments and media assets share one lifecycle: content is approved by
 * default, moderators can censor it, and can later reapprove it. Censored publications and
 * publication comments are hidden from every reader except their authors; censored media leaves the
 * galleries it is attached to. Rows are kept so the decision can be reversed.
 */
import { Schema } from "effect"

import { ModerationStatus } from "../common/enums.js"
import { PersonId, WikiArticleId, WikiArticleRevisionId } from "../common/ids.js"
import { Handle, TimestampColumn } from "../common/primitives.js"
import { WikiArticleKind } from "../wiki/wiki-article.js"

/** The decisions a moderator can take; `APPROVED_BY_DEFAULT` is only ever assigned on creation. */
export const ModerationDecision = ModerationStatus.pick(["CENSORED", "REAPPROVED_AFTER_CENSORING"])
export type ModerationDecision = typeof ModerationDecision.Type

export const ModerateContentPayload = Schema.Struct({ decision: ModerationDecision })
export type ModerateContentPayload = typeof ModerateContentPayload.Type

export const ModerationResult = Schema.Struct({ moderationStatus: ModerationStatus })
export type ModerationResult = typeof ModerationResult.Type

export const ModeratedContentType = Schema.Literals([
  "PUBLICATION",
  "PUBLICATION_COMMENT",
  "MEDIA_ASSET",
])

export type ModeratedContentType = typeof ModeratedContentType.Type

export const isCensored = (status: ModerationStatus) => status === "CENSORED"

/** Reapproving content that was never censored keeps its current status. */
export const applyModerationDecision = (
  current: ModerationStatus,
  decision: ModerationDecision,
): ModerationStatus =>
  decision === "CENSORED" ? "CENSORED" : isCensored(current) ? decision : current

/**
 * The moderation queue lists pending reviews: anything waiting on a moderator's decision,
 * oldest first. Items aren't assigned to specific moderators.
 */
export const NewcomerAwaitingApproval = Schema.TaggedStruct("NewcomerAwaitingApproval", {
  personId: PersonId,
  handle: Handle,
  name: Schema.String,
  waitingSince: TimestampColumn,
})

export type NewcomerAwaitingApproval = typeof NewcomerAwaitingApproval.Type

export const RevisionAwaitingEvaluation = Schema.TaggedStruct("RevisionAwaitingEvaluation", {
  revisionId: WikiArticleRevisionId,
  wikiArticleId: WikiArticleId,
  /** Revisions of articles still pending approval propose creating them. */
  proposesNewArticle: Schema.Boolean,
  /** Only published articles have a kind and handle projection. */
  kind: Schema.NullOr(WikiArticleKind),
  handle: Schema.NullOr(Handle),
  createdById: Schema.NullOr(PersonId),
  waitingSince: TimestampColumn,
})

export type RevisionAwaitingEvaluation = typeof RevisionAwaitingEvaluation.Type

export const PendingReview = Schema.Union([NewcomerAwaitingApproval, RevisionAwaitingEvaluation])
export type PendingReview = typeof PendingReview.Type
