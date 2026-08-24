import { Schema, SchemaAST } from "effect"

import { WikiArticleStatus } from "../../common/enums.js"
import { WikiArticleId } from "../../common/ids.js"
import { TimestampedStruct } from "../../common/primitives.js"
import { LoroDocFrontier } from "../../crdts/domain.js"
import { WikiArticleEditableTranslations } from "../wiki-article-translation.js"

export const coreWikiArticleMaterializedRowFields = {
  ...TimestampedStruct.fields,
  id: WikiArticleId,
  status: WikiArticleStatus,
  currentCrdtFrontier: Schema.fromJsonString(LoroDocFrontier),
} as const

export interface DefineKindInput<
  Kind extends Schema.Literal<SchemaAST.LiteralValue>,
  EditableAttributes extends Schema.Struct<Schema.Struct.Fields>,
  MaterializedAttributes extends Schema.Struct<Schema.Struct.Fields>,
  MaterializeAttributes extends (
    editableAttributes: EditableAttributes["Type"],
  ) => MaterializedAttributes["Type"],
> {
  readonly Kind: Kind
  readonly EditableAttributes: EditableAttributes
  readonly MaterializedAttributes: MaterializedAttributes
  readonly materializeAttributes: MaterializeAttributes
}

export const defineKind = <
  Kind extends Schema.Literal<SchemaAST.LiteralValue>,
  EditableAttributes extends Schema.Struct<Schema.Struct.Fields>,
  MaterializedAttributes extends Schema.Struct<Schema.Struct.Fields>,
  MaterializeAttributes extends (
    editableAttributes: EditableAttributes["Type"],
  ) => MaterializedAttributes["Type"],
>({
  Kind,
  EditableAttributes,
  MaterializedAttributes,
  materializeAttributes,
}: DefineKindInput<Kind, EditableAttributes, MaterializedAttributes, MaterializeAttributes>) => ({
  Kind,
  EditableAttributes,
  MaterializedAttributes,
  materializeAttributes,
  EditableArticle: Schema.Struct({
    kind: Kind,
    attributes: EditableAttributes,
    translations: WikiArticleEditableTranslations,
  }),
  MaterializedRow: Schema.Struct({
    ...coreWikiArticleMaterializedRowFields,
    kind: Kind,
    attributes: MaterializedAttributes,
  }),
})
