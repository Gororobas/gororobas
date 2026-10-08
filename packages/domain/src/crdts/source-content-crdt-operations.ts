import { Effect, Equal, Record, Schema, SchemaTransformation } from "effect"
import { LoroDoc, LoroMap } from "loro-crdt"

import { ContentLanguage } from "../common/content-language.js"
import { SupportedLanguage } from "../common/enums.js"
import { SourceContentFields, TranslatedContent } from "../common/source-content.js"
import { TiptapDocument } from "../rich-text/domain.js"
import { loroRichTextToTiptap, updateLoroRichText } from "../rich-text/loro-prosemirror.js"
import { CrdtContainerNotFoundError, InvalidCrdtUpdateError } from "./errors.js"
import { toLoroValue } from "./loro-values.js"

// Loro scalar roots must be wrapped; the domain exposes a plain language tag.
export const SourceContentStorageFields = {
  ...SourceContentFields,
  sourceLanguage: Schema.Struct({ value: ContentLanguage }).pipe(
    Schema.decodeTo(
      Schema.toType(ContentLanguage),
      SchemaTransformation.transform({
        decode: (stored) => stored.value,
        encode: (value) => ({ value }),
      }),
    ),
  ),
}

export const projectSourceContentCrdtDocument = (document: LoroDoc) => ({
  ...document.toJSON(),
  sourceLanguage: document.getMap("sourceLanguage").toJSON(),
  sourceContent: loroRichTextToTiptap(document.getMap("sourceContent")),
  translations: Record.fromEntries(
    document
      .getMap("translations")
      .entries()
      .map(([language, value]) => {
        if (value === "original") return [language, value]
        if (!(value instanceof LoroMap)) {
          throw new InvalidCrdtUpdateError({ reason: "SchemaValidation" })
        }
        const content = value.get("content")
        if (!(content instanceof LoroMap)) {
          throw new InvalidCrdtUpdateError({ reason: "SchemaValidation" })
        }
        return [language, { ...value.toJSON(), content: loroRichTextToTiptap(content) }]
      }),
  ),
})

/** Machine workflows reconcile translation results; frontend bindings edit the native containers directly. */
export const makeSourceContentCrdtOperations = <P extends string>(name: P) => {
  const SetSourceContent = Schema.TaggedStruct(`Set${name}SourceContent`, {
    content: TiptapDocument,
  })
  const SetSourceLanguage = Schema.TaggedStruct(`Set${name}SourceLanguage`, {
    sourceLanguage: ContentLanguage,
  })
  const SetTranslation = Schema.TaggedStruct(`Set${name}Translation`, {
    language: SupportedLanguage,
    value: Schema.Union([Schema.Literal("original"), TranslatedContent]),
  })
  const RemovedTranslation = Schema.TaggedStruct(`Removed${name}Translation`, {
    language: SupportedLanguage,
  })
  const SetTranslationContent = Schema.TaggedStruct(`Set${name}TranslationContent`, {
    language: SupportedLanguage,
    content: TiptapDocument,
  })

  return [
    {
      message: SetSourceContent,
      handler: (document: LoroDoc, payload: typeof SetSourceContent.Type) =>
        Effect.sync(() => {
          updateLoroRichText(document.getMap("sourceContent"), payload.content)
        }),
    },
    {
      message: SetSourceLanguage,
      handler: (document: LoroDoc, payload: typeof SetSourceLanguage.Type) =>
        Effect.sync(() => {
          const sourceLanguage = document.getMap("sourceLanguage")
          if (sourceLanguage.get("value") === payload.sourceLanguage) return
          sourceLanguage.set("value", payload.sourceLanguage)

          // Aliases follow the source; correcting detection never moves its rich-text containers.
          SupportedLanguage.literals.forEach((language) => {
            if (document.getMap("translations").get(language) === "original") {
              document.getMap("translations").delete(language)
            }
          })

          const language = new Intl.Locale(payload.sourceLanguage).language
          if (Schema.is(SupportedLanguage)(language)) {
            document.getMap("translations").set(language, "original")
          }
        }),
    },
    {
      message: SetTranslation,
      handler: Effect.fn(function* (document: LoroDoc, payload: typeof SetTranslation.Type) {
        const translations = document.getMap("translations")

        if (payload.value === "original") {
          if (translations.get(payload.language) !== "original") {
            translations.set(payload.language, "original")
          }
          return
        }

        const value = yield* Schema.encodeEffect(Schema.toType(TranslatedContent))(payload.value)
        if (translations.get(payload.language) === "original") translations.delete(payload.language)
        const translation = translations.ensureMergeableMap(payload.language)
        ;(["originalLanguage", "translationSource"] as const).forEach((key) => {
          if (translation.get(key) !== value[key]) translation.set(key, value[key])
        })

        if (
          !Equal.equals(
            translation.toJSON().translatedAtCrdtFrontier,
            value.translatedAtCrdtFrontier,
          )
        ) {
          const frontier = translation.ensureMergeableMovableList("translatedAtCrdtFrontier")
          if (frontier.length) frontier.delete(0, frontier.length)
          value.translatedAtCrdtFrontier.forEach((entry) => frontier.push(toLoroValue(entry)))
        }

        updateLoroRichText(translation.ensureMergeableMap("content"), value.content)
      }),
    },
    {
      message: RemovedTranslation,
      handler: (document: LoroDoc, payload: typeof RemovedTranslation.Type) =>
        Effect.sync(() => {
          document.getMap("translations").delete(payload.language)
        }),
    },
    {
      message: SetTranslationContent,
      handler: Effect.fn(function* (document: LoroDoc, payload: typeof SetTranslationContent.Type) {
        const translation = document.getMap("translations").get(payload.language)
        const content = translation instanceof LoroMap ? translation.get("content") : undefined

        if (!(content instanceof LoroMap)) {
          return yield* new CrdtContainerNotFoundError({
            path: ["translations", payload.language, "content"],
          })
        }

        updateLoroRichText(content, payload.content)
      }),
    },
  ] as const
}
