import { Schema } from "effect"

import { PersonId, WikiArticleId } from "../common/ids.js"
import { NonEmptyTrimmedString } from "../common/primitives.js"
import { ChangesetId } from "./sources.js"

/**
 * What one person submits at once to one article: claims and article text revisions, with an
 * optional summary of why ("from Embrapa's 2019 booklet"). Named after OpenStreetMap's changesets,
 * which group a mapper's edits under one comment. Moderators see it whole and evaluate its parts
 * one by one, and a vandal's changeset can be reverted as one.
 *
 * Grouping by author and evaluation can't stand in for it: two edits days apart would merge, the
 * group would split as parts get evaluated, and deleted authors would all merge into one.
 */
export const Changeset = Schema.Struct({
  id: ChangesetId,
  wikiArticleId: WikiArticleId,
  authorId: Schema.NullOr(PersonId),
  summary: Schema.NullOr(NonEmptyTrimmedString),
  createdAt: Schema.DateTimeUtcFromString,
})

export type Changeset = typeof Changeset.Type
