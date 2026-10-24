import { hashString, TiptapDocument, tiptapToHtml } from "@gororobas/domain"
import { type PublicationClassification } from "@gororobas/domain"
import { DateTime, Effect, Context } from "effect"

import { CLASSIFICATION_VERSION } from "./classification-version.js"
import { extractWikiArticles } from "./extract-wiki-articles.js"
import { LangExtractService } from "./langextract-service.js"

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
