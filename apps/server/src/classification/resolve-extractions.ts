/**
 * Resolves raw LangExtract extractions to database entities.
 *
 * Uses a priority-based scoring strategy (inspired by experiment 016) with
 * accent-normalized matching against handles and searchable_names.
 *
 * Resolution for wikiArticles:
 *   1. Exact handle match → existing
 *   2. Exact or substring match via searchable_names → existing
 *   3. No match → suggested (with names from extraction attributes)
 */
import {
  stringToHandle,
  WikiArticleProjectionRow,
  type Handle,
  type WikiArticleId,
} from "@gororobas/domain"
import {
  CommonExtractionData,
  ResolvedExistingWikiArticleExtraction,
  SuggestedWikiArticleExtraction,
} from "@gororobas/domain"
import { Array as EffectArray, Effect, Option, Predicate, Record, Struct } from "effect"
import type { Extraction } from "langextract"

import { WikiArticlesRepository } from "../wiki/repository.js"

function toCommonExtractionFields(extraction: Extraction) {
  return CommonExtractionData.mapFields(Struct.omit(["handle"])).make({
    extractionText: extraction.extractionText,
    extractionClass: extraction.extractionClass,
    alignmentStatus: extraction.alignmentStatus ?? null,
    charInterval: extraction.charInterval
      ? {
          startPos: extraction.charInterval.startPos ?? null,
          endPos: extraction.charInterval.endPos ?? null,
        }
      : null,
    description: extraction.description || null,
    attributes: extraction.attributes ?? {},
  })
}

/** Attribute keys requested by the extraction prompt and examples. */
const NAME_ATTRIBUTE_BY_LANGUAGE = {
  pt: "wiki_article_pt",
  es: "wiki_article_es",
  en: "wiki_article_en",
} as const

const attributeValues = (
  attributes: Extraction["attributes"],
  key: string,
): ReadonlyArray<string> => {
  const value = attributes?.[key]
  return Predicate.isString(value) ? [value] : Array.isArray(value) ? value : []
}

export function collectWikiArticleCandidates(extraction: Extraction): string[] {
  const candidates = Record.values(NAME_ATTRIBUTE_BY_LANGUAGE).flatMap((key) =>
    attributeValues(extraction.attributes, key),
  )
  if (EffectArray.isReadonlyArrayEmpty(candidates) && extraction.extractionText) {
    return [extraction.extractionText]
  }
  return candidates
}

const suggestedName = (extraction: Extraction, language: keyof typeof NAME_ATTRIBUTE_BY_LANGUAGE) =>
  attributeValues(extraction.attributes, NAME_ATTRIBUTE_BY_LANGUAGE[language])[0] ??
  extraction.extractionText

export const resolveWikiArticleExtraction = Effect.fn("resolveWikiArticleExtraction")(function* (
  extraction: Extraction,
) {
  const wikiArticlesRepository = yield* WikiArticlesRepository

  const candidates = collectWikiArticleCandidates(extraction)
  yield* Effect.logDebug(
    `Resolving wikiArticle extraction: "${extraction.extractionText}". Candidates: [${candidates.join(", ")}]`,
  )

  const common = toCommonExtractionFields(extraction)

  const handleMatch = yield* Effect.reduce(
    () => Option.none<WikiArticleProjectionRow & { handle: Handle }>(),
    (found: Option.Option<WikiArticleProjectionRow & { handle: Handle }>, candidate: string) => {
      if (Option.isSome(found)) return Effect.succeed(found)

      return Effect.gen(function* () {
        const handle = yield* stringToHandle(candidate)
        yield* Effect.logDebug(`Trying handle match for "${candidate}" -> "${handle}"`)
        return yield* wikiArticlesRepository
          .findByHandle(handle)
          .pipe(Effect.map(Option.map((row) => ({ ...row, handle: handle }))))
      })
    },
  )(candidates)

  if (Option.isSome(handleMatch)) {
    yield* Effect.logDebug(
      `Found existing wikiArticle by handle: "${handleMatch.value.handle}" -> ${handleMatch.value.id}`,
    )

    return ResolvedExistingWikiArticleExtraction.make({
      ...common,
      wikiArticleId: handleMatch.value.id,
      handle: handleMatch.value.handle,
    })
  }

  const searchableNameMatch = yield* Effect.reduce(
    () => Option.none<{ wikiArticleId: WikiArticleId; handle: Handle }>(),
    (found: Option.Option<{ wikiArticleId: WikiArticleId; handle: Handle }>, candidate: string) => {
      if (Option.isSome(found)) return Effect.succeed(found)

      return Effect.gen(function* () {
        const handle = yield* stringToHandle(candidate)
        const pattern = `%${handle}%`
        yield* Effect.logDebug(
          `Trying searchable_name match for "${candidate}" -> pattern "${pattern}"`,
        )
        return yield* wikiArticlesRepository.findBySearchableName(pattern)
      })
    },
  )(candidates)

  if (Option.isSome(searchableNameMatch)) {
    yield* Effect.logDebug(
      `Found existing wikiArticle by searchable_name: "${searchableNameMatch.value.handle}" -> ${searchableNameMatch.value.wikiArticleId}`,
    )

    return ResolvedExistingWikiArticleExtraction.make({
      ...common,
      wikiArticleId: searchableNameMatch.value.wikiArticleId,
      handle: searchableNameMatch.value.handle,
    })
  }

  yield* Effect.logDebug(
    `No match found for wikiArticle "${extraction.extractionText}" (candidates: ${candidates.join(", ")}) -> creating suggested`,
  )

  return SuggestedWikiArticleExtraction.make({
    ...common,
    handle: yield* stringToHandle(extraction.extractionText),
    names: {
      pt: suggestedName(extraction, "pt"),
      es: suggestedName(extraction, "es"),
      en: suggestedName(extraction, "en"),
    },
  })
})
