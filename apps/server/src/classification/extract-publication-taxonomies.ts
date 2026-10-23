import { hashString, TiptapDocument, tiptapToHtml } from "@gororobas/domain"
import { type PublicationClassification } from "@gororobas/domain"
import { Config, DateTime, Effect, Context } from "effect"

import { LangExtractService } from "./langextract-service.js"
import { langExtractExamples } from "./langextract.examples.js"
import { resolveWikiArticleExtraction } from "./resolve-extractions.js"

/**
 * Bump this when prompts, examples, or extraction logic changes.
 * Format: ISO date + revision number within that day.
 */
export const CLASSIFICATION_VERSION = "2026-10-19.1" as const

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
  "Extract wiki articles, including plants, animals, tools, practices, concepts and themes (such as permaculture, harvesting or land access), and other knowledge entities. Map regional names to canonical names and return lowercase, slugified names in PT (wiki_article_pt), ES (wiki_article_es), and EN (wiki_article_en)."

const extractWikiArticles = Effect.fn("extractWikiArticles")(function* (html: string) {
  const langextract = yield* LangExtractService
  const resolutionConcurrency = yield* Config.Number("CLASSIFICATION_RESOLUTION_CONCURRENCY").pipe(
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

export class ExtractPublicationTaxonomiesService extends Context.Service<ExtractPublicationTaxonomiesService>()(
  "ExtractPublicationTaxonomiesService",
  {
    make: Effect.succeed({
      extract: (input: TiptapDocument, crdtFrontier: PublicationClassification["crdtFrontier"]) =>
        Effect.gen(function* () {
          const langExtract = yield* LangExtractService
          const started_at = yield* DateTime.now

          const html = tiptapToHtml(input)
          const hash = yield* hashString(html)

          yield* Effect.logDebug("Extracting with LangExtract", html)
          const wikiArticles = yield* extractWikiArticles(html)

          yield* Effect.logDebug(
            `Finished extracting with LangExtract. Found ${wikiArticles.length} wikiArticles`,
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
          } satisfies PublicationClassification
        }),
    }),
  },
) {}
