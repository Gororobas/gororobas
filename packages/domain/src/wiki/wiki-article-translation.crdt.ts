import { Effect, Option, Schema } from "effect"
import { type LoroDoc, LoroMap } from "loro-crdt"

import { GrammaticalGender, SupportedLanguage } from "../common/enums.js"
import { ValidName } from "../common/primitives.js"
import { defineCrdtOperations } from "../crdts/define-crdt-operations.js"
import { CrdtContainerNotFoundError, InvalidCrdtUpdateError } from "../crdts/errors.js"
import { toLoroValue } from "../crdts/loro-values.js"
import { makeMovableListEditOperations } from "../crdts/movable-list-edit-operations.js"
import { makeOptionalTranslatedScalarEditOperations } from "../crdts/optional-translated-scalar-edit-operations.js"
import { TiptapDocument } from "../rich-text/domain.js"
import { updateLoroRichText } from "../rich-text/loro-prosemirror.js"
import { WikiArticleEditableTranslation } from "./wiki-article-translation.js"

const getTranslation = (document: LoroDoc, language: SupportedLanguage) =>
  Effect.gen(function* () {
    const translation = document.getMap("translations").get(language)
    if (!(translation instanceof LoroMap)) {
      return yield* new CrdtContainerNotFoundError({ path: ["translations", language] })
    }
    return translation
  })

const nameOperationsForLanguage = (language: SupportedLanguage) =>
  makeMovableListEditOperations("WikiArticleTranslationCommonName")({
    ValueSchema: ValidName,
    getContainer: (document) =>
      getTranslation(document, language).pipe(
        Effect.map((translation) => translation.ensureMergeableMovableList("commonNames")),
      ),
  })

const nameOperations = {
  en: nameOperationsForLanguage("en"),
  es: nameOperationsForLanguage("es"),
  pt: nameOperationsForLanguage("pt"),
}

const AddedTranslation = Schema.TaggedStruct("AddedWikiArticleTranslation", {
  language: SupportedLanguage,
  value: WikiArticleEditableTranslation,
})

const RemovedTranslation = Schema.TaggedStruct("RemovedWikiArticleTranslation", {
  language: SupportedLanguage,
})

const SetContent = Schema.TaggedStruct("SetWikiArticleTranslationContent", {
  language: SupportedLanguage,
  content: TiptapDocument,
})

const UnsetContent = Schema.TaggedStruct("UnsetWikiArticleTranslationContent", {
  language: SupportedLanguage,
})

const AddedName = Schema.Struct({
  ...nameOperations.en[0].message.fields,
  language: SupportedLanguage,
})

const RemovedName = Schema.Struct({
  ...nameOperations.en[1].message.fields,
  language: SupportedLanguage,
})

const UpdatedName = Schema.Struct({
  ...nameOperations.en[2].message.fields,
  language: SupportedLanguage,
})

const MovedName = Schema.Struct({
  ...nameOperations.en[3].message.fields,
  language: SupportedLanguage,
  newIndex: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
})

export const WikiArticleTranslationCrdtOperations = defineCrdtOperations([
  {
    message: AddedTranslation,
    handler: Effect.fn(function* (document: LoroDoc, payload: typeof AddedTranslation.Type) {
      const translations = document.getMap("translations")
      if (translations.get(payload.language) !== undefined) {
        return yield* new InvalidCrdtUpdateError({ reason: "SchemaValidation" })
      }
      const encodedNames = yield* Schema.encodeEffect(
        WikiArticleEditableTranslation.fields.commonNames,
      )(payload.value.commonNames)
      const translation = translations.ensureMergeableMap(payload.language)
      // Re-adding a deleted mergeable map resurfaces old children; clear them before initialization.
      translation.keys().forEach((key) => translation.delete(key))
      const names = translation.ensureMergeableMovableList("commonNames")
      if (names.length) names.delete(0, names.length)
      encodedNames.forEach((name) => names.push(toLoroValue(name)))
      if (Option.isSome(payload.value.grammaticalGender)) {
        translation.set("grammaticalGender", payload.value.grammaticalGender.value)
      }
      if (Option.isSome(payload.value.content)) {
        updateLoroRichText(translation.ensureMergeableMap("content"), payload.value.content.value)
      }
    }),
  },
  {
    message: RemovedTranslation,
    handler: Effect.fn(function* (document: LoroDoc, payload: typeof RemovedTranslation.Type) {
      yield* getTranslation(document, payload.language)
      document.getMap("translations").delete(payload.language)
    }),
  },
  {
    message: SetContent,
    handler: Effect.fn(function* (document: LoroDoc, payload: typeof SetContent.Type) {
      const translation = yield* getTranslation(document, payload.language)
      updateLoroRichText(translation.ensureMergeableMap("content"), payload.content)
    }),
  },
  {
    message: UnsetContent,
    handler: Effect.fn(function* (document: LoroDoc, payload: typeof UnsetContent.Type) {
      const translation = yield* getTranslation(document, payload.language)
      translation.delete("content")
    }),
  },
  {
    message: AddedName,
    handler: (document: LoroDoc, payload: typeof AddedName.Type) =>
      nameOperations[payload.language][0].handler(document, payload),
  },
  {
    message: RemovedName,
    handler: Effect.fn(function* (document: LoroDoc, payload: typeof RemovedName.Type) {
      const translation = yield* getTranslation(document, payload.language)
      if (translation.ensureMergeableMovableList("commonNames").length <= 1) {
        return yield* new InvalidCrdtUpdateError({ reason: "SchemaValidation" })
      }
      yield* nameOperations[payload.language][1].handler(document, payload)
    }),
  },
  {
    message: UpdatedName,
    handler: (document: LoroDoc, payload: typeof UpdatedName.Type) =>
      nameOperations[payload.language][2].handler(document, payload),
  },
  {
    message: MovedName,
    handler: Effect.fn(function* (document: LoroDoc, payload: typeof MovedName.Type) {
      const translation = yield* getTranslation(document, payload.language)
      if (payload.newIndex >= translation.ensureMergeableMovableList("commonNames").length) {
        return yield* new InvalidCrdtUpdateError({ reason: "SchemaValidation" })
      }
      yield* nameOperations[payload.language][3].handler(document, payload)
    }),
  },
  ...makeOptionalTranslatedScalarEditOperations("WikiArticleTranslationGrammaticalGender")({
    ValueSchema: GrammaticalGender,
    getParentContainer: getTranslation,
    keyInParentContainer: "grammaticalGender",
  }),
])
