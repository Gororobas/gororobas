import { Schema } from "effect"

import { ValidName } from "../../common/primitives.js"
import { toSearchableText } from "../../common/utils/strings.js"

/**
 * A name compared the way people read it: "Futuro Ancestral" and "futuro ancestral" are the same
 * value, so their claims attest it together. Readers see the best-ranked claim's spelling.
 */
export const FoldedName = ValidName.pipe(
  Schema.overrideToEquivalence(
    () => (self, that) => toSearchableText(self) === toSearchableText(that),
  ),
)
