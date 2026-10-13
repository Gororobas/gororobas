import { Effect, Option, Schema } from "effect"
import { type LoroDoc, LoroMap } from "loro-crdt"

import { SupportedLanguage } from "../common/enums.js"
import { defineCrdtOperations } from "../crdts/define-crdt-operations.js"
import { CrdtContainerNotFoundError, InvalidCrdtUpdateError } from "../crdts/errors.js"
import { TiptapDocument } from "../rich-text/domain.js"
import { updateLoroRichText } from "../rich-text/loro-prosemirror.js"
import {
  initializeWikiArticleCommonNames,
  WikiArticleCommonNameCrdtOperations,
} from "./wiki-article-common-name.crdt.js"
import { WikiArticleEditableTranslation } from "./wiki-article-translation.js"

const getTranslation = (document: LoroDoc, language: SupportedLanguage) =>
  Effect.gen(function* () {
    const translation = document.getMap("translations").get(language)
    if (!(translation instanceof LoroMap)) {
      return yield* new CrdtContainerNotFoundError({ path: ["translations", language] })
    }
    return translation
  })

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

export const WikiArticleTranslationCrdtOperations = defineCrdtOperations([
  {
    message: AddedTranslation,
    handler: Effect.fn(function* (document: LoroDoc, payload: typeof AddedTranslation.Type) {
      const translations = document.getMap("translations")
      if (translations.get(payload.language) !== undefined) {
        return yield* new InvalidCrdtUpdateError({ reason: "SchemaValidation" })
      }
      const translation = translations.ensureMergeableMap(payload.language)
      // Re-adding a deleted mergeable map resurfaces old children; clear them before initialization.
      translation.keys().forEach((key) => translation.delete(key))
      const names = translation.ensureMergeableMovableList("commonNames")
      initializeWikiArticleCommonNames(names, payload.value.commonNames)
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
  ...WikiArticleCommonNameCrdtOperations,
])
