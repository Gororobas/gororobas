import { Schema, SchemaAST } from "effect"

import { WikiArticleStatus } from "../../common/enums.js"
import { WikiArticleId } from "../../common/ids.js"
import { Handle, OptionalColumn, TimestampedStruct, ValidName } from "../../common/primitives.js"
import { LoroDocFrontier } from "../../crdts/domain.js"
import { TiptapDocument } from "../../rich-text/domain.js"
import {
  WikiArticleEditableTranslation,
  commonWikiArticleTranslationMaterializedFields,
} from "../wiki-article-translation.js"

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
  TranslationFields extends Schema.Struct.Fields,
  MaterializeAttributes extends (
    editableAttributes: EditableAttributes["Type"],
  ) => MaterializedAttributes["Type"],
> {
  readonly Kind: Kind
  readonly EditableAttributes: EditableAttributes
  readonly MaterializedAttributes: MaterializedAttributes
  readonly materializeAttributes: MaterializeAttributes
  // @todo rename to TranslatableAttributes and better document that it's for fields beyond commonNames et. al
  readonly EditableTranslationFields: TranslationFields
}

export const defineKind = <
  Kind extends Schema.Literal<SchemaAST.LiteralValue>,
  EditableAttributes extends Schema.Struct<Schema.Struct.Fields>,
  MaterializedAttributes extends Schema.Struct<Schema.Struct.Fields>,
  const TranslationFields extends Schema.Struct.Fields,
  MaterializeAttributes extends (
    editableAttributes: EditableAttributes["Type"],
  ) => MaterializedAttributes["Type"],
>({
  Kind,
  EditableAttributes,
  MaterializedAttributes,
  materializeAttributes,
  EditableTranslationFields,
}: DefineKindInput<
  Kind,
  EditableAttributes,
  MaterializedAttributes,
  TranslationFields,
  MaterializeAttributes
>) => {
  const EditableTranslation = Schema.Struct({
    ...EditableTranslationFields,
    ...WikiArticleEditableTranslation.fields,
  })
  const TranslationMaterializedRow = Schema.Struct({
    ...EditableTranslationFields,
    ...commonWikiArticleTranslationMaterializedFields,
    kind: Kind,
  })
  const MaterializedRow = Schema.Struct({
    ...coreWikiArticleMaterializedRowFields,
    kind: Kind,
    attributes: Schema.fromJsonString(MaterializedAttributes),
  })
  return {
    Kind,
    EditableAttributes,
    MaterializedAttributes,
    materializeAttributes,
    EditableTranslation,
    TranslationMaterializedRow,
    EditableArticle: Schema.Struct({
      kind: Kind,
      attributes: EditableAttributes,
      translations: Schema.Struct({
        en: Schema.optional(EditableTranslation),
        es: Schema.optional(EditableTranslation),
        pt: Schema.optional(EditableTranslation),
      }),
    }),
    MaterializedRow,
    QueriedPageData: Schema.Struct({
      ...MaterializedRow.fields,
      ...TranslationMaterializedRow.fields,
      attributes: MaterializedAttributes,
      commonNames: Schema.Array(ValidName),
      content: OptionalColumn(TiptapDocument),
      handle: Handle,
    }),
  }
}
