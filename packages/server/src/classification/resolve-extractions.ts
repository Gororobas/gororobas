/**
 * Resolves raw LangExtract extractions to database entities.
 *
 * Uses a priority-based scoring strategy (inspired by experiment 016) with
 * accent-normalized matching against handles and searchable_names.
 *
 * Resolution for vegetables:
 *   1. Exact handle match → existing
 *   2. Exact or substring match via searchable_names → existing
 *   3. No match → suggested (with names from extraction attributes)
 *
 * Resolution for tags:
 *   1. Exact handle match → existing
 *   2. Name match in tag names JSON → existing
 *   3. No match → suggested (with names from extraction attributes)
 */
import { stringToHandle, type Handle, type VegetableId, type VegetableRow } from "@gororobas/domain"
import {
  CommonExtractionData,
  ResolvedExistingTagExtraction,
  ResolvedExistingVegetableExtraction,
  SuggestedTagExtraction,
  SuggestedVegetableExtraction,
} from "@gororobas/domain"
import { Array as EffectArray, Effect, Option, Predicate, Struct } from "effect"
import type { Extraction } from "langextract"

import { TagsRepository } from "../tags/repository.js"
import { VegetablesRepository } from "../vegetables/repository.js"

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

function collectVegetableCandidates(extraction: Extraction): string[] {
  const attributes = extraction.attributes ?? {}
  const candidates = ["vegetable_pt", "vegetable_es", "vegetable_en"].flatMap((key) => {
    const value = attributes[key]
    return Predicate.isString(value) ? [value] : Array.isArray(value) ? value : []
  })
  if (EffectArray.isReadonlyArrayEmpty(candidates) && extraction.extractionText) {
    return [extraction.extractionText]
  }
  return candidates
}

export const resolveVegetableExtraction = Effect.fn("resolveVegetableExtraction")(function* (
  extraction: Extraction,
) {
  const vegetablesRepository = yield* VegetablesRepository

  const candidates = collectVegetableCandidates(extraction)
  yield* Effect.logDebug(
    `Resolving vegetable extraction: "${extraction.extractionText}". Candidates: [${candidates.join(", ")}]`,
  )

  const common = toCommonExtractionFields(extraction)

  const handleMatch = yield* Effect.reduce(
    () => Option.none<VegetableRow>(),
    (found: Option.Option<VegetableRow>, candidate: string) => {
      if (Option.isSome(found)) return Effect.succeed(found)

      return Effect.gen(function* () {
        const handle = yield* stringToHandle(candidate)
        yield* Effect.logDebug(`Trying handle match for "${candidate}" -> "${handle}"`)
        return yield* vegetablesRepository.findByHandle(handle)
      })
    },
  )(candidates)
  if (Option.isSome(handleMatch)) {
    yield* Effect.logDebug(
      `Found existing vegetable by handle: "${handleMatch.value.handle}" -> ${handleMatch.value.id}`,
    )
    return ResolvedExistingVegetableExtraction.make({
      ...common,
      vegetableId: handleMatch.value.id,
      handle: handleMatch.value.handle,
    })
  }

  const searchableNameMatch = yield* Effect.reduce(
    () => Option.none<{ vegetableId: VegetableId; handle: Handle }>(),
    (found: Option.Option<{ vegetableId: VegetableId; handle: Handle }>, candidate: string) => {
      if (Option.isSome(found)) return Effect.succeed(found)

      return Effect.gen(function* () {
        const handle = yield* stringToHandle(candidate)
        const pattern = `%${handle}%`
        yield* Effect.logDebug(
          `Trying searchable_name match for "${candidate}" -> pattern "${pattern}"`,
        )
        return yield* vegetablesRepository.findBySearchableName(pattern)
      })
    },
  )(candidates)
  if (Option.isSome(searchableNameMatch)) {
    yield* Effect.logDebug(
      `Found existing vegetable by searchable_name: "${searchableNameMatch.value.handle}" -> ${searchableNameMatch.value.vegetableId}`,
    )
    return ResolvedExistingVegetableExtraction.make({
      ...common,
      vegetableId: searchableNameMatch.value.vegetableId,
      handle: searchableNameMatch.value.handle,
    })
  }

  yield* Effect.logDebug(
    `No match found for vegetable "${extraction.extractionText}" (candidates: ${candidates.join(", ")}) -> creating suggested`,
  )
  return SuggestedVegetableExtraction.make({
    ...common,
    handle: yield* stringToHandle(extraction.extractionText),
    names: {
      pt: Predicate.isString(common.attributes.vegetable_pt)
        ? common.attributes.vegetable_pt
        : extraction.extractionText,
      es: Predicate.isString(common.attributes.vegetable_es)
        ? common.attributes.vegetable_es
        : extraction.extractionText,
      en: Predicate.isString(common.attributes.vegetable_en)
        ? common.attributes.vegetable_en
        : extraction.extractionText,
    },
  })
})

export const resolveTagExtraction = Effect.fn("resolveTagExtraction")(function* (
  extraction: Extraction,
) {
  const tagsRepository = yield* TagsRepository
  const common = toCommonExtractionFields(extraction)
  const { attributes } = common
  const status = attributes.status
  const tagHandle = yield* stringToHandle(
    Predicate.isString(attributes.tag) ? attributes.tag : extraction.extractionText,
  )

  yield* Effect.logDebug(
    `Resolving tag extraction: "${extraction.extractionText}" -> handle "${tagHandle}", status: ${String(status ?? "undefined")}`,
  )

  if (status === "existing" || !status) {
    yield* Effect.logDebug(`Trying handle match for tag "${tagHandle}"`)
    const handleMatch = yield* tagsRepository.findByHandle(tagHandle)
    if (Option.isSome(handleMatch)) {
      yield* Effect.logDebug(
        `Found existing tag by handle: "${tagHandle}" -> ${handleMatch.value.id}`,
      )
      return ResolvedExistingTagExtraction.make({
        ...common,
        tagId: handleMatch.value.id,
        handle: yield* stringToHandle(handleMatch.value.handle),
      })
    }

    const namePattern = `%${tagHandle}%`
    yield* Effect.logDebug(`Trying name match for tag with pattern "${namePattern}"`)
    const nameMatch = yield* tagsRepository.findByName(namePattern)
    if (Option.isSome(nameMatch)) {
      yield* Effect.logDebug(`Found existing tag by name: "${tagHandle}" -> ${nameMatch.value.id}`)
      return ResolvedExistingTagExtraction.make({
        ...common,
        tagId: nameMatch.value.id,
        handle: yield* stringToHandle(nameMatch.value.handle),
      })
    }
  }

  yield* Effect.logDebug(
    `No match found for tag "${extraction.extractionText}" -> creating suggested`,
  )
  return SuggestedTagExtraction.make({
    ...common,
    handle: tagHandle,
    names: {
      pt: Predicate.isString(attributes.name_pt) ? attributes.name_pt : extraction.extractionText,
      es: Predicate.isString(attributes.name_es) ? attributes.name_es : extraction.extractionText,
      en: Predicate.isString(attributes.name_en) ? attributes.name_en : extraction.extractionText,
    },
  })
})
