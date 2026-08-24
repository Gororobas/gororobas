import { TiptapDocument, tiptapToHtml } from "@gororobas/domain"
import type { TagRow } from "@gororobas/domain"
import { type PublicationClassification } from "@gororobas/domain"
import { createHash } from "crypto"
import { Config, DateTime, Effect, Context, Record } from "effect"

import { TagsRepository } from "../tags/repository.js"
import { LangExtractService } from "./langextract-service.js"
import { langExtractExamples } from "./langextract.examples.js"
import { resolveTagExtraction, resolveWikiArticleExtraction } from "./resolve-extractions.js"

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
export function publicationClassificationIdempotencyKey(
  publication_id: string,
  content_hash: string,
): string {
  return `publication-classification:${publication_id}:${content_hash}:${CLASSIFICATION_VERSION}`
}

const WIKI_ARTICLE_EXTRACTION_PROMPT =
  "Extract wiki articles, including plants, animals, tools, concepts, and other knowledge entities. Map regional names to canonical names and return lowercase, slugified names in PT (wiki_article_pt), ES (wiki_article_es), and EN (wiki_article_en)."

const extractWikiArticles = Effect.fn("extractWikiArticles")(function* (html: string) {
  const langextract = yield* LangExtractService
  const resolutionConcurrency = yield* Config.number("CLASSIFICATION_RESOLUTION_CONCURRENCY").pipe(
    Config.withDefault(5),
  )

  const result = yield* langextract.extract(html, {
    promptDescription: WIKI_ARTICLE_EXTRACTION_PROMPT,
    examples: langExtractExamples.wikiArticles,
  })

  return yield* Effect.forEach(result.extractions ?? [], resolveWikiArticleExtraction, {
    concurrency: resolutionConcurrency,
  })
})

function buildTagExtractionPrompt(existingTags: ReadonlyArray<TagRow>): string {
  const tagsForPrompt = existingTags.map((t) => {
    const names = Record.toEntries(t.names).flatMap(([locale, name]) =>
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

export class ExtractPublicationTaxonomiesService extends Context.Service<ExtractPublicationTaxonomiesService>()(
  "ExtractPublicationTaxonomiesService",
  {
    make: Effect.succeed({
      extract: (input: TiptapDocument, crdtFrontier: PublicationClassification["crdtFrontier"]) =>
        Effect.gen(function* () {
          const langExtract = yield* LangExtractService
          const started_at = yield* DateTime.now

          const html = tiptapToHtml(input)
          const hash = hashString(html)

          yield* Effect.logDebug("Extracting with LangExtract", html)
          const [wikiArticles, tags] = yield* Effect.all(
            [extractWikiArticles(html), extractTags(html)],
            { concurrency: "unbounded" },
          )

          yield* Effect.logDebug(
            `Finished extracting with LangExtract. Found ${wikiArticles.length} wikiArticles and ${tags.length} tags`,
          )

          const finished_at = yield* DateTime.now

          return {
            version: CLASSIFICATION_VERSION,
            modelInfo: {
              modelId: langExtract.model_info.model_id,
              modelType: langExtract.model_info.model_type,
            },
            contentHash: hash,
            crdtFrontier,
            startedAt: started_at,
            finishedAt: finished_at,
            wikiArticles,
            tags,
          } satisfies PublicationClassification
        }),
    }),
  },
) {}
