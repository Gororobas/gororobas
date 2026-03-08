import { TiptapDocument, tiptapToHtml } from "@gororobas/domain"
import type { TagRow } from "@gororobas/domain"
import { type PostClassification } from "@gororobas/domain"
import { createHash } from "crypto"
import { Config, DateTime, Effect, ServiceMap } from "effect"

import { TagsRepository } from "../tags/repository.js"
import { LangExtractService } from "./langextract-service.js"
import { langExtractExamples } from "./langextract.examples.js"
import { resolveTagExtraction, resolveVegetableExtraction } from "./resolve-extractions.js"

export const hashString = (html: string) =>
  createHash("sha256").update(html).digest("hex").slice(0, 16)

/**
 * Bump this when prompts, examples, or extraction logic changes.
 * Format: ISO date + revision number within that day.
 */
export const CLASSIFICATION_VERSION = "2026-02-19.1" as const

/**
 * Builds the idempotency key for a classification workflow run.
 * Same content + same prompts + same model = skip.
 */
export function postClassificationIdempotencyKey(post_id: string, content_hash: string): string {
  return `post-classification:${post_id}:${content_hash}:${CLASSIFICATION_VERSION}`
}

const VEGETABLE_EXTRACTION_PROMPT =
  "Extract vegetables (including indirect ingredients like dishes that reference vegetables). Map regional names to most widely used vegetable names (e.g., 'moranga' -> 'abobora', 'aipim' -> 'mandioca'). Return a lowercase, slugified version of the most common canonical vegetable names in PT (vegetable_pt), ES (vegetable_es) and EN (vegetable_en)."

const extractVegetables = Effect.fn("extractVegetables")(function* (html: string) {
  const langextract = yield* LangExtractService
  const resolutionConcurrency = yield* Config.number("CLASSIFICATION_RESOLUTION_CONCURRENCY").pipe(
    Config.withDefault(5),
  )

  const result = yield* langextract.extract(html, {
    promptDescription: VEGETABLE_EXTRACTION_PROMPT,
    examples: langExtractExamples.vegetables,
  })

  return yield* Effect.forEach(result.extractions ?? [], resolveVegetableExtraction, {
    concurrency: resolutionConcurrency,
  })
})

function buildTagExtractionPrompt(existingTags: ReadonlyArray<TagRow>): string {
  const tagsForPrompt = existingTags.map((t) => {
    const names = Object.entries(t.names).flatMap(([locale, name]) =>
      name ? `${name} (${locale})` : [],
    )
    return `- ${t.handle} (handle) - ${names.join("; ")}`
  })

  return `Extract tags related to agroecology and permaculture contexts. Tags can be extracted from actions, concepts, or inferred from context. For existing tags, return their \`handle\` with \`status: 'existing'\`. For suggested tags that aren't yet in the database, return \`status: 'suggested'\`, a \`tag: suggested_handle\` and \`name_pt: string\`, \`name_es: string\`, \`name_en: string\`.

The following tags exist:
  ${tagsForPrompt.join("\n  ")}`
}

const extractTags = Effect.fn("extractTags")(function* (html: string) {
  const langextract = yield* LangExtractService
  const tags = yield* TagsRepository
  const resolutionConcurrency = yield* Config.number("CLASSIFICATION_RESOLUTION_CONCURRENCY").pipe(
    Config.withDefault(5),
  )
  const allTags = yield* tags.findAll()
  const prompt = buildTagExtractionPrompt(allTags)

  const result = yield* langextract.extract(html, {
    promptDescription: prompt,
    examples: langExtractExamples.tags,
  })

  return yield* Effect.forEach(result.extractions ?? [], resolveTagExtraction, {
    concurrency: resolutionConcurrency,
  })
})

export class ExtractPostTaxonomiesService extends ServiceMap.Service<ExtractPostTaxonomiesService>()(
  "ExtractPostTaxonomiesService",
  {
    make: Effect.succeed({
      extract: (input: TiptapDocument, crdt_frontier: PostClassification["crdt_frontier"]) =>
        Effect.gen(function* () {
          const langExtract = yield* LangExtractService
          const started_at = yield* DateTime.now

          const html = tiptapToHtml(input)
          const hash = hashString(html)

          yield* Effect.logDebug("Extracting with LangExtract", html)
          const [vegetables, tags] = yield* Effect.all(
            [extractVegetables(html), extractTags(html)],
            { concurrency: "unbounded" },
          )

          yield* Effect.logDebug(
            `Finished extracting with LangExtract. Found ${vegetables.length} vegetables and ${tags.length} tags`,
          )

          const finished_at = yield* DateTime.now

          return {
            version: CLASSIFICATION_VERSION,
            model_info: langExtract.model_info,
            content_hash: hash,
            crdt_frontier,
            started_at,
            finished_at,
            vegetables,
            tags,
          } satisfies PostClassification
        }),
    }),
  },
) {}
