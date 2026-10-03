import { Effect, Predicate, Record, Schema, SchemaTransformation } from "effect"
import { LoroDoc, LoroMap } from "loro-crdt"

import { CrdtCommit, LoroDocFrontier, LoroDocSnapshot, LoroDocUpdate } from "../crdts/domain.js"
import { InvalidCrdtUpdateError } from "../crdts/errors.js"
import {
  applyCrdtUpdateWithCommit,
  loroDocToSnapshot,
  loroDocToUpdate,
  parseCrdtUpdate,
  snapshotToLoroDoc,
} from "../crdts/lib.js"
import { toLoroString, toLoroValue } from "../crdts/loro-values.js"
import { TiptapDocument } from "../rich-text/domain.js"
import { initializeLoroRichText, loroRichTextToTiptap } from "../rich-text/loro-prosemirror.js"
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
export const applyWikiArticleEdit = (document: LoroDoc, edit: WikiArticleEdit) => {
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
  kind: document.getMap("kind").toJSON(),
  attributes: document.getMap("attributes").toJSON(),
  translations: Record.fromEntries(
    document
      .getMap("translations")
      .entries()
      .map(([locale, translation]) => {
        if (!(translation instanceof LoroMap))
          throw new InvalidCrdtUpdateError({ reason: "SchemaValidation" })
        const content = translation.get("content")
        if (content !== undefined && !(content instanceof LoroMap))
          throw new InvalidCrdtUpdateError({ reason: "SchemaValidation" })
        return [
          locale,
          {
            ...Record.filter(translation.toJSON(), (_, key) => key !== "content"),
            ...(content instanceof LoroMap ? { content: loroRichTextToTiptap(content) } : {}),
          },
        ]
      }),
  ),
})

const isJsonArray = (value: Schema.Json): value is Schema.JsonArray => Array.isArray(value)

const isJsonObject = (value: Schema.Json): value is Schema.JsonObject =>
  Predicate.isObject(value) && !isJsonArray(value)

const initializeMap = (map: LoroMap, values: Schema.JsonObject) => {
  Record.toEntries(values).forEach(([key, value]) => {
    if (value === null) return
    if (isJsonArray(value)) {
      const list = map.ensureMergeableMovableList(toLoroString(key))
      value.forEach((item, index) => list.insert(index, toLoroValue(item)))
    } else if (isJsonObject(value) && !("_tag" in value) && !("type" in value)) {
      initializeMap(map.ensureMergeableMap(toLoroString(key)), value)
    } else {
      map.set(toLoroString(key), toLoroValue(value))
    }
  })
}

export const createWikiArticleCrdtDocument = Effect.fn("createWikiArticleCrdtDocument")(function* (
  sourceData: WikiArticleEditableData,
) {
  const sourceDocument = new LoroDoc()
  sourceDocument.configDefaultTextStyle({ expand: "after" })
  const json = yield* Schema.encodeEffect(Schema.fromJsonString(WikiArticleCrdtData))(sourceData)
  const encoded = yield* Schema.decodeUnknownEffect(
    Schema.fromJsonString(
      Schema.Struct({
        attributes: Schema.Record(Schema.String, Schema.Json),
        translations: Schema.Record(Schema.String, Schema.Record(Schema.String, Schema.Json)),
      }),
    ),
  )(json)
  sourceDocument.getMap("kind").set("value", sourceData.kind)
  initializeMap(sourceDocument.getMap("attributes"), encoded.attributes)
  Record.toEntries(encoded.translations).forEach(([locale, values]) => {
    const translation = sourceDocument.getMap("translations").ensureMergeableMap(locale)
    initializeMap(
      translation,
      Record.filter(values, (_, key) => key !== "content"),
    )
    if (values.content !== undefined && values.content !== null)
      initializeLoroRichText(
        translation.ensureMergeableMap("content"),
        Schema.decodeUnknownSync(TiptapDocument)(values.content),
      )
  })

  return {
    currentCrdtFrontier: LoroDocFrontier.make(sourceDocument.frontiers()),
    crdtSnapshot: loroDocToSnapshot(sourceDocument),
    initialCrdtUpdate: loroDocToUpdate(sourceDocument),
    sourceData,
  } as const
})

export const parseWikiArticleCrdtUpdate = (input: {
  crdtUpdate: LoroDocUpdate
  snapshot: LoroDocSnapshot
}) =>
  parseCrdtUpdate({
    crdtUpdate: input.crdtUpdate,
    sourceDocument: snapshotToLoroDoc(input.snapshot),
    targetSchema: WikiArticleCrdtData,
    projectDocument: projectWikiArticleDocument,
  })

export const applyWikiArticleCrdtUpdateWithCommit = (input: {
  commit: CrdtCommit
  crdtUpdate: LoroDocUpdate
  snapshot: LoroDocSnapshot
}) =>
  applyCrdtUpdateWithCommit({
    commit: input.commit,
    crdtUpdate: input.crdtUpdate,
    snapshot: input.snapshot,
    targetSchema: WikiArticleCrdtData,
    projectDocument: projectWikiArticleDocument,
  })
