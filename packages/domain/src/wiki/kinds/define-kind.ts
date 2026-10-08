import { Schema, SchemaAST } from "effect"

import { WikiArticleStatus } from "../../common/enums.js"
import { WikiArticleId } from "../../common/ids.js"
import { Handle, OptionalColumn, TimestampedStruct, ValidName } from "../../common/primitives.js"
import { LoroDocFrontier } from "../../crdts/domain.js"
import { MediaAssetRow } from "../../media-assets/domain.js"
import { TiptapDocument } from "../../rich-text/domain.js"
import {
  WikiArticleEditableTranslation,
  commonWikiArticleTranslationProjectionFields,
} from "../wiki-article-translation.js"

export const coreWikiArticleProjectionRowFields = {
  ...TimestampedStruct.fields,
  id: WikiArticleId,
  status: WikiArticleStatus,
  currentCrdtFrontier: Schema.fromJsonString(LoroDocFrontier),
} as const

export interface DefineKindInput<
  Kind extends Schema.Literal<SchemaAST.LiteralValue>,
  EditableAttributes extends Schema.Struct<Schema.Struct.Fields>,
  ProjectedAttributes extends Schema.Struct<Schema.Struct.Fields>,
  TranslationFields extends Schema.Struct.Fields,
  ProjectAttributes extends (
    editableAttributes: EditableAttributes["Type"],
  ) => ProjectedAttributes["Type"],
> {
  readonly Kind: Kind
  readonly EditableAttributes: EditableAttributes
  readonly ProjectedAttributes: ProjectedAttributes
  readonly projectAttributes: ProjectAttributes
  // @todo rename to TranslatableAttributes and better document that it's for fields beyond commonNames et. al
  readonly EditableTranslationFields: TranslationFields
}

export const defineKind = <
  Kind extends Schema.Literal<SchemaAST.LiteralValue>,
  EditableAttributes extends Schema.Struct<Schema.Struct.Fields>,
  ProjectedAttributes extends Schema.Struct<Schema.Struct.Fields>,
  const TranslationFields extends Schema.Struct.Fields,
  ProjectAttributes extends (
    editableAttributes: EditableAttributes["Type"],
  ) => ProjectedAttributes["Type"],
>({
  Kind,
  EditableAttributes,
  ProjectedAttributes,
  projectAttributes,
  EditableTranslationFields,
}: DefineKindInput<
  Kind,
  EditableAttributes,
  ProjectedAttributes,
  TranslationFields,
  ProjectAttributes
>) => {
  const EditableTranslation = Schema.Struct({
    ...EditableTranslationFields,
    ...WikiArticleEditableTranslation.fields,
  })

  const TranslationProjectionRow = Schema.Struct({
    ...EditableTranslationFields,
    ...commonWikiArticleTranslationProjectionFields,
    kind: Kind,
  })

  const ProjectionRow = Schema.Struct({
    ...coreWikiArticleProjectionRowFields,
    kind: Kind,
    attributes: Schema.fromJsonString(ProjectedAttributes),
  })

  return {
    Kind,
    EditableAttributes,
    ProjectedAttributes,
    projectAttributes,
    EditableTranslation,
    TranslationProjectionRow,
    EditableArticle: Schema.Struct({
      kind: Kind,
      attributes: EditableAttributes,
      translations: Schema.Struct({
        en: Schema.optional(EditableTranslation),
        es: Schema.optional(EditableTranslation),
        pt: Schema.optional(EditableTranslation),
      }),
    }),
    ProjectionRow,
    QueriedPageData: Schema.Struct({
      ...ProjectionRow.fields,
      ...TranslationProjectionRow.fields,
      attributes: ProjectedAttributes,
      commonNames: Schema.Array(ValidName),
      content: OptionalColumn(TiptapDocument),
      handle: Handle,
      mediaAssets: Schema.Array(MediaAssetRow),
    }),
  }
}
