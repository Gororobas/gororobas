import { Schema } from "effect"

import { GrammaticalGender } from "../../common/enums.js"
import { FoldedName } from "./folded-name.js"

/**
 * One of an article's names: today's `WikiArticleCommonName`. A different grammatical gender is a
 * different value, so correcting it is a change.
 */
export const Name = Schema.Struct({
  name: FoldedName,
  grammaticalGender: Schema.NullOr(GrammaticalGender),
})

export type Name = typeof Name.Type
