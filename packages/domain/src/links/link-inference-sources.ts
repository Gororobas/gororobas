import { HashSet, Option, Predicate, Record, String as EffectString } from "effect"

import { SupportedLanguage } from "../common/enums.js"
import type { LoroListItemId } from "../common/ids.js"
import type { TiptapDocument } from "../rich-text/domain.js"
import type { WikiArticleEditableData } from "../wiki/wiki-article.js"
import type { EvidenceLocation } from "./domain.js"
import { makeSourceTextBuilder, type SourceText } from "./source-text.js"

/** "scientificNames" → "scientific names" */
const labelOf = (key: string) =>
  EffectString.camelToSnake(key).replaceAll("_", " ").toLocaleLowerCase("en")

type ValuesOf<T> = T extends unknown ? T[keyof T] : never
type WikiArticleTranslation = NonNullable<
  WikiArticleEditableData["translations"][SupportedLanguage]
>

type OptionValue<T> = T extends Option.Option<infer A> ? A : never

/** A value of any kind's attributes or translation fields. */
type AttributeValue =
  | ValuesOf<WikiArticleEditableData["attributes"]>
  | ValuesOf<WikiArticleTranslation>

const isList = <A>(value: A): value is Extract<A, ReadonlyArray<unknown>> => Array.isArray(value)

/**
 * The textual values of an attribute: names, free text and literal sets (as lowercase words).
 * Numbers, dates and identifiers carry nothing to link from.
 */
const textualValues = (
  value: AttributeValue,
): ReadonlyArray<{ readonly text: string; readonly itemId?: LoroListItemId }> => {
  const present = Option.isOption(value)
    ? Option.getOrUndefined<OptionValue<AttributeValue>>(value)
    : value

  if (Predicate.isString(present)) {
    return EffectString.isNonEmpty(present.trim()) ? [{ text: present }] : []
  }

  if (HashSet.isHashSet(present)) {
    return Array.from(present).flatMap((literal) =>
      Predicate.isString(literal) ? [{ text: labelOf(literal.toLowerCase()) }] : [],
    )
  }

  if (isList(present)) {
    // Common names are read as their own lines; other lists hold names of other entities.
    return present.flatMap((item) =>
      "value" in item ? [{ text: item.value, itemId: item.id }] : [],
    )
  }

  return []
}

const withItem = (path: EvidenceLocation, itemId: LoroListItemId | undefined): EvidenceLocation =>
  itemId === undefined ? path : [...path, { id: itemId }]

/**
 * Every translation of a wiki article is read, since contributors write them independently.
 * Attributes come first, so content can be read with the article's identity in mind.
 */
export const wikiArticleSourceText = (article: WikiArticleEditableData): SourceText => {
  const builder = makeSourceTextBuilder()

  Record.toEntries<string, AttributeValue>(article.attributes).forEach(([attribute, value]) =>
    builder.appendValues(
      labelOf(attribute),
      textualValues(value).map(({ text, itemId }) => ({
        text,
        location: withItem(["attributes", attribute], itemId),
      })),
    ),
  )

  SupportedLanguage.literals.forEach((supportedLanguage) => {
    const translation = article.translations[supportedLanguage]
    if (translation === undefined) return
    const translationPath = ["translations", supportedLanguage] as const

    builder.appendValues(
      "common names",
      translation.commonNames.map(({ id, name }) => ({
        text: name,
        location: [...translationPath, "commonNames", { id }],
      })),
    )

    Record.toEntries<string, AttributeValue>(translation).forEach(([field, value]) => {
      if (field === "commonNames" || field === "content") return

      builder.appendValues(
        labelOf(field),
        textualValues(value).map(({ text, itemId }) => ({
          text,
          location: withItem([...translationPath, field], itemId),
        })),
      )
    })

    Option.map(translation.content, (content) =>
      builder.appendRichText([...translationPath, "content"], content),
    )
  })

  return builder.build()
}

/** Publications are read in their source language; translations are machine copies of it. */
export const publicationSourceText = (input: {
  readonly sourceContent: TiptapDocument
}): SourceText => {
  const builder = makeSourceTextBuilder()
  builder.appendRichText(["sourceContent"], input.sourceContent)
  return builder.build()
}

/** What the model should know about the article, without being asked to link from it. */
export const wikiArticleContext = (article: WikiArticleEditableData): string => {
  const names = SupportedLanguage.literals.flatMap((language) =>
    (article.translations[language]?.commonNames ?? []).map(({ name }) => name),
  )
  return `The text is the wiki article about ${names.join(" / ")} (${labelOf(article.kind.toLowerCase())}). Don't extract the article's own subject.`
}
