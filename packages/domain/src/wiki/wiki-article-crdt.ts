import { Effect, Record, Schema, SchemaTransformation } from "effect"
import { type LoroDoc, LoroMap } from "loro-crdt"

import { defineCrdtDocument } from "../crdts/define-crdt-document.js"
import { InvalidCrdtUpdateError } from "../crdts/errors.js"
import { createLoroDocFromData } from "../crdts/lib.js"
import { loroRichTextToTiptap } from "../rich-text/loro-prosemirror.js"
import { WikiAnimalArticleCrdtOperations } from "./kinds/animal.crdt.js"
import { WikiBookArticleCrdtOperations } from "./kinds/book.crdt.js"
import { WikiConceptArticleCrdtOperations } from "./kinds/concept.crdt.js"
import { WikiFilmArticleCrdtOperations } from "./kinds/film.crdt.js"
import { WikiNoteworthyEntityArticleCrdtOperations } from "./kinds/noteworthy-entity.crdt.js"
import { WikiPlantCultivarArticleCrdtOperations } from "./kinds/plant-cultivar.crdt.js"
import { WikiPlantArticleCrdtOperations } from "./kinds/plant.crdt.js"
import { WikiResourceArticleCrdtOperations } from "./kinds/resource.crdt.js"
import { WikiToolArticleCrdtOperations } from "./kinds/tool.crdt.js"
import { WikiUncategorizedArticleCrdtOperations } from "./kinds/uncategorized.crdt.js"
import { WikiArticleEditableData } from "./wiki-article.js"

export const WikiArticleEdit = Schema.Union([
  WikiAnimalArticleCrdtOperations.AttributeEdit,
  WikiBookArticleCrdtOperations.AttributeEdit,
  WikiConceptArticleCrdtOperations.AttributeEdit,
  WikiFilmArticleCrdtOperations.AttributeEdit,
  WikiNoteworthyEntityArticleCrdtOperations.AttributeEdit,
  WikiPlantArticleCrdtOperations.AttributeEdit,
  WikiPlantCultivarArticleCrdtOperations.AttributeEdit,
  WikiResourceArticleCrdtOperations.AttributeEdit,
  WikiToolArticleCrdtOperations.AttributeEdit,
  WikiUncategorizedArticleCrdtOperations.AttributeEdit,
  // @todo wiki-article-translation
])

export type WikiArticleEdit = typeof WikiArticleEdit.Type

/** @todo rewrite with Match */
const applyWikiArticleEdit = (document: LoroDoc, edit: WikiArticleEdit) => {
  if (Schema.is(WikiAnimalArticleCrdtOperations.AttributeEdit)(edit)) {
    return WikiAnimalArticleCrdtOperations.applyAttributeEdit(document, edit)
  }
  if (Schema.is(WikiBookArticleCrdtOperations.AttributeEdit)(edit)) {
    return WikiBookArticleCrdtOperations.applyAttributeEdit(document, edit)
  }
  if (Schema.is(WikiConceptArticleCrdtOperations.AttributeEdit)(edit)) {
    return WikiConceptArticleCrdtOperations.applyAttributeEdit(document, edit)
  }
  if (Schema.is(WikiFilmArticleCrdtOperations.AttributeEdit)(edit)) {
    return WikiFilmArticleCrdtOperations.applyAttributeEdit(document, edit)
  }
  if (Schema.is(WikiNoteworthyEntityArticleCrdtOperations.AttributeEdit)(edit)) {
    return WikiNoteworthyEntityArticleCrdtOperations.applyAttributeEdit(document, edit)
  }
  if (Schema.is(WikiPlantArticleCrdtOperations.AttributeEdit)(edit)) {
    return WikiPlantArticleCrdtOperations.applyAttributeEdit(document, edit)
  }
  if (Schema.is(WikiPlantCultivarArticleCrdtOperations.AttributeEdit)(edit)) {
    return WikiPlantCultivarArticleCrdtOperations.applyAttributeEdit(document, edit)
  }
  if (Schema.is(WikiResourceArticleCrdtOperations.AttributeEdit)(edit)) {
    return WikiResourceArticleCrdtOperations.applyAttributeEdit(document, edit)
  }
  if (Schema.is(WikiToolArticleCrdtOperations.AttributeEdit)(edit)) {
    return WikiToolArticleCrdtOperations.applyAttributeEdit(document, edit)
  }
  if (Schema.is(WikiUncategorizedArticleCrdtOperations.AttributeEdit)(edit)) {
    return WikiUncategorizedArticleCrdtOperations.applyAttributeEdit(document, edit)
  }
  // @todo wiki-article-translation
  return Effect.succeed(undefined)
}

// Loro roots are containers; wrap the scalar kind while keeping attributes and translations at their existing roots.
const WikiArticleCrdtData = WikiArticleEditableData.mapMembers((members) =>
  members.map((member) =>
    Schema.Struct({
      ...member.fields,
      attributes: Schema.Unknown.pipe(
        Schema.withDecodingDefaultKey(Effect.succeed({})),
        Schema.decodeTo(member.fields.attributes),
      ),
      translations: member.fields.translations.pipe(
        Schema.withDecodingDefaultKey(Effect.succeed({})),
      ),
      kind: Schema.Struct({ value: member.fields.kind }).pipe(
        Schema.decodeTo(
          member.fields.kind,
          SchemaTransformation.transform({
            decode: (stored) => stored.value,
            encode: (kind) => ({ value: kind }),
          }),
        ),
      ),
    }),
  ),
).pipe(Schema.decodeTo(Schema.toType(WikiArticleEditableData)))

const projectWikiArticleDocument = (document: LoroDoc) => ({
  ...document.toJSON(),
  kind: document.getMap("kind").toJSON(),
  attributes: document.getMap("attributes").toJSON(),
  translations: Record.fromEntries(
    document
      .getMap("translations")
      .entries()
      .map(([language, translation]) => {
        if (!(translation instanceof LoroMap)) {
          throw new InvalidCrdtUpdateError({ reason: "SchemaValidation" })
        }
        const content = translation.get("content")
        if (content !== undefined && !(content instanceof LoroMap)) {
          throw new InvalidCrdtUpdateError({ reason: "SchemaValidation" })
        }

        return [
          language,
          {
            ...Record.filter(translation.toJSON(), (_, key) => key !== "content"),
            ...(content instanceof LoroMap ? { content: loroRichTextToTiptap(content) } : {}),
          },
        ]
      }),
  ),
})

const createWikiArticleDocument = Effect.fn("createWikiArticleDocument")(function* (
  sourceData: WikiArticleEditableData,
) {
  const json = yield* Schema.encodeEffect(Schema.fromJsonString(WikiArticleCrdtData))(sourceData)

  const encoded = yield* Schema.decodeEffect(
    Schema.fromJsonString(
      Schema.Struct({
        attributes: Schema.Record(Schema.String, Schema.Json),
        translations: Schema.Record(Schema.String, Schema.Record(Schema.String, Schema.Json)),
      }),
    ),
  )(json)

  const sourceDocument = createLoroDocFromData(
    {
      kind: { value: sourceData.kind },
      attributes: encoded.attributes,
      translations: encoded.translations,
    },
    { omitNull: true },
  )

  return sourceDocument
})

export const WikiArticleCrdt = defineCrdtDocument({
  schema: WikiArticleCrdtData,
  createDocument: createWikiArticleDocument,
  projectDocument: projectWikiArticleDocument,
  applyEdit: applyWikiArticleEdit,
})
