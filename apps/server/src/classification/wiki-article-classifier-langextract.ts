import { ResolvedExistingWikiArticleExtraction, tiptapToHtml } from "@gororobas/domain"
import { Effect, Layer, Schema } from "effect"
import { SqlClient } from "effect/sql"

import { WikiArticlesRepository } from "../wiki/repository.js"
import { extractWikiArticles } from "./extract-wiki-articles.js"
import { LangExtractService } from "./langextract-service.js"
import {
  type ClassifiedWikiArticle,
  WikiArticleClassificationError,
  WikiArticleClassifier,
} from "./wiki-article-classifier.js"

export const WikiArticleClassifierLangExtract = Layer.effect(
  WikiArticleClassifier,
  Effect.gen(function* () {
    const langExtract = yield* LangExtractService
    const repository = yield* WikiArticlesRepository
    const sql = yield* SqlClient.SqlClient

    return {
      classify: (contents) =>
        Effect.forEach(contents, (content) => extractWikiArticles(tiptapToHtml(content)), {
          concurrency: 1,
        }).pipe(
          Effect.map((extractions) =>
            extractions
              .flat()
              .filter(Schema.is(ResolvedExistingWikiArticleExtraction))
              .map((extraction): ClassifiedWikiArticle => ({
                wikiArticleId: extraction.wikiArticleId,
                extractionText: extraction.extractionText,
              })),
          ),
          Effect.provideService(LangExtractService, langExtract),
          Effect.provideService(WikiArticlesRepository, repository),
          Effect.provideService(SqlClient.SqlClient, sql),
          Effect.mapError(
            (cause) =>
              new WikiArticleClassificationError({
                message: "Wiki article extraction failed",
                retryable: true,
                cause,
              }),
          ),
        ),
    }
  }),
).pipe(
  Layer.provide(Layer.effect(LangExtractService, LangExtractService.make)),
  Layer.provide(Layer.effect(WikiArticlesRepository, WikiArticlesRepository.make)),
)
