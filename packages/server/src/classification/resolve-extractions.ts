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
import { stringToHandle, type Handle } from "@gororobas/domain"
import {
  CommonExtractionData,
  ResolvedExistingTagExtraction,
  ResolvedExistingVegetableExtraction,
  SuggestedTagExtraction,
  SuggestedVegetableExtraction,
} from "@gororobas/domain"
import { Effect, Option, Struct } from "effect"
import type { Extraction } from "langextract"

import { TagsRepository } from "../tags/repository.js"
import { VegetablesRepository } from "../vegetables/repository.js"

function toCommonExtractionFields(extraction: Extraction) {
  return CommonExtractionData.mapFields(Struct.omit(["handle"])).makeUnsafe({
    extraction_text: extraction.extractionText,
    extraction_class: extraction.extractionClass,
    alignment_status: extraction.alignmentStatus,
    char_interval: extraction.charInterval
      ? {
          start_pos: extraction.charInterval.startPos,
          end_pos: extraction.charInterval.endPos,
        }
      : undefined,
    description: extraction.description,
    attributes: extraction.attributes ?? {},
  })
}

function collectVegetableCandidates(extraction: Extraction): string[] {
  const candidates: string[] = []
  const attributes = extraction.attributes ?? {}
  for (const key of ["vegetable_pt", "vegetable_es", "vegetable_en"]) {
    const value = attributes[key]
    if (typeof value === "string") {
      candidates.push(value)
    } else if (Array.isArray(value) === true) {
      candidates.push(...value)
    }
  }
  if (candidates.length === 0 && extraction.extractionText) {
    candidates.push(extraction.extractionText)
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

  for (const candidate of candidates) {
    const handle = stringToHandle(candidate)
    yield* Effect.logDebug(`Trying handle match for "${candidate}" -> "${handle}"`)
    const match = yield* vegetablesRepository.findByHandle(handle)
    if (Option.isSome(match) === true) {
      yield* Effect.logDebug(`Found existing vegetable by handle: "${handle}" -> ${match.value.id}`)
      return ResolvedExistingVegetableExtraction.makeUnsafe({
        ...common,
        vegetable_id: match.value.id,
        handle: match.value.handle as Handle,
      })
    }
  }

  for (const candidate of candidates) {
    const handle = stringToHandle(candidate)
    const pattern = `%${handle}%`
    yield* Effect.logDebug(
      `Trying searchable_name match for "${candidate}" -> pattern "${pattern}"`,
    )
    const match = yield* vegetablesRepository.findBySearchableName(pattern)
    if (Option.isSome(match) === true) {
      yield* Effect.logDebug(
        `Found existing vegetable by searchable_name: "${handle}" -> ${match.value.vegetableId}`,
      )
      return ResolvedExistingVegetableExtraction.makeUnsafe({
        ...common,
        vegetable_id: match.value.vegetableId,
        handle: match.value.handle as Handle,
      })
    }
  }

  yield* Effect.logDebug(
    `No match found for vegetable "${extraction.extractionText}" (candidates: ${candidates.join(", ")}) -> creating suggested`,
  )
  return SuggestedVegetableExtraction.makeUnsafe({
    ...common,
    handle: stringToHandle(extraction.extractionText),
    names: {
      pt:
        typeof common.attributes.vegetable_pt === "string"
          ? common.attributes.vegetable_pt
          : extraction.extractionText,
      es:
        typeof common.attributes.vegetable_es === "string"
          ? common.attributes.vegetable_es
          : extraction.extractionText,
      en:
        typeof common.attributes.vegetable_en === "string"
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
  const tagHandle = stringToHandle(
    typeof attributes.tag === "string" ? attributes.tag : extraction.extractionText,
  )

  yield* Effect.logDebug(
    `Resolving tag extraction: "${extraction.extractionText}" -> handle "${tagHandle}", status: ${String(status ?? "undefined")}`,
  )

  if (status === "existing" || !status) {
    yield* Effect.logDebug(`Trying handle match for tag "${tagHandle}"`)
    const handleMatch = yield* tagsRepository.findByHandle(tagHandle)
    if (Option.isSome(handleMatch) === true) {
      yield* Effect.logDebug(
        `Found existing tag by handle: "${tagHandle}" -> ${handleMatch.value.id}`,
      )
      return ResolvedExistingTagExtraction.makeUnsafe({
        ...common,
        tag_id: handleMatch.value.id,
        handle: stringToHandle(handleMatch.value.handle),
      })
    }

    const namePattern = `%${tagHandle}%`
    yield* Effect.logDebug(`Trying name match for tag with pattern "${namePattern}"`)
    const nameMatch = yield* tagsRepository.findByName(namePattern)
    if (Option.isSome(nameMatch) === true) {
      yield* Effect.logDebug(`Found existing tag by name: "${tagHandle}" -> ${nameMatch.value.id}`)
      return ResolvedExistingTagExtraction.makeUnsafe({
        ...common,
        tag_id: nameMatch.value.id,
        handle: stringToHandle(nameMatch.value.handle),
      })
    }
  }

  yield* Effect.logDebug(
    `No match found for tag "${extraction.extractionText}" -> creating suggested`,
  )
  return SuggestedTagExtraction.makeUnsafe({
    ...common,
    handle: tagHandle,
    names: {
      pt: typeof attributes.name_pt === "string" ? attributes.name_pt : extraction.extractionText,
      es: typeof attributes.name_es === "string" ? attributes.name_es : extraction.extractionText,
      en: typeof attributes.name_en === "string" ? attributes.name_en : extraction.extractionText,
    },
  })
})
