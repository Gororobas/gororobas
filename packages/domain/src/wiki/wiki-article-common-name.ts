import { Schema } from "effect"

import { GrammaticalGender } from "../common/enums.js"
import { LoroListItemId } from "../common/ids.js"
import { OptionalColumn, ValidName } from "../common/primitives.js"

export const WikiArticleCommonName = Schema.Struct({
  name: ValidName,
  grammaticalGender: OptionalColumn(GrammaticalGender),
})
export type WikiArticleCommonName = typeof WikiArticleCommonName.Type

export const WikiArticleCommonNameInCrdtList = Schema.Struct({
  id: LoroListItemId,
  ...WikiArticleCommonName.fields,
})
export type WikiArticleCommonNameInCrdtList = typeof WikiArticleCommonNameInCrdtList.Type
