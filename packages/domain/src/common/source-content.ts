import { Schema } from "effect"

import { LoroDocFrontier } from "../crdts/domain.js"
import { TiptapDocument } from "../rich-text/domain.js"
import { ContentLanguage } from "./content-language.js"
import { SupportedLanguage, TranslationSource } from "./enums.js"

export const TranslatedContent = Schema.Struct({
  content: TiptapDocument,
  originalLanguage: ContentLanguage,
  translationSource: Schema.Literals(["AUTOMATIC", "MANUAL"]),
  translatedAtCrdtFrontier: LoroDocFrontier,
})

export type TranslatedContent = typeof TranslatedContent.Type

export const ContentTranslations = Schema.Struct({
  pt: Schema.optional(Schema.Union([Schema.Literal("original"), TranslatedContent])),
  es: Schema.optional(Schema.Union([Schema.Literal("original"), TranslatedContent])),
  en: Schema.optional(Schema.Union([Schema.Literal("original"), TranslatedContent])),
})

export const SourceContentFields = {
  sourceContent: TiptapDocument,
  sourceLanguage: ContentLanguage,
  translations: ContentTranslations,
}

export const SourceContent = Schema.Struct(SourceContentFields).check(
  Schema.makeFilter(
    (value) =>
      SupportedLanguage.literals.every(
        (language) =>
          value.translations[language] === undefined ||
          (new Intl.Locale(value.sourceLanguage).language === language
            ? value.translations[language] === "original"
            : value.translations[language] !== "original"),
      ),
    {
      identifier: "OriginalContentAliases",
      title: "Original content aliases",
      description: "Original aliases must match the source language.",
    },
  ),
)

export type SourceContent = typeof SourceContent.Type

type ContentProjection = {
  content: typeof TiptapDocument.Type
  language: ContentLanguage
  originalLanguage: ContentLanguage
  translationSource: TranslationSource
  translatedAtCrdtFrontier: typeof LoroDocFrontier.Type | null
}

/** The original is always projected, including undetermined and unsupported languages. */
export const projectContentTranslations = (data: SourceContent): ContentProjection[] => [
  {
    content: data.sourceContent,
    language: data.sourceLanguage,
    originalLanguage: data.sourceLanguage,
    translationSource: "ORIGINAL" as const,
    translatedAtCrdtFrontier: null,
  },
  ...SupportedLanguage.literals.flatMap<ContentProjection>((language) => {
    const translation = data.translations[language]

    if (
      translation === undefined ||
      (translation === "original" && language === data.sourceLanguage)
    ) {
      return []
    }

    if (translation === "original") {
      return [
        {
          content: data.sourceContent,
          language: ContentLanguage.make(language),
          originalLanguage: data.sourceLanguage,
          translationSource: "ORIGINAL" as const,
          translatedAtCrdtFrontier: null,
        },
      ]
    }

    return [{ ...translation, language: ContentLanguage.make(language) }]
  }),
]
