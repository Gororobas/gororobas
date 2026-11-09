import { type Equivalence, Schema } from "effect"

import { GrammaticalGender } from "../../common/enums.js"
import { ValidName } from "../../common/primitives.js"
import { toSearchableText } from "../../common/utils/strings.js"

/** A label or alias: today's `WikiArticleCommonName`. */
export const Name = Schema.Struct({
  name: ValidName,
  grammaticalGender: Schema.NullOr(GrammaticalGender),
})

export type Name = typeof Name.Type

/** Google Books' "Futuro Ancestral" and a person's "futuro ancestral" attest one name, no matter the gender. */
export const sameName: Equivalence.Equivalence<Name> = (self, that) =>
  toSearchableText(self.name) === toSearchableText(that.name)
