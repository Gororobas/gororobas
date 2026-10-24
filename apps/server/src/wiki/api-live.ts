import { GororobasApi } from "@gororobas/domain"
import { Effect, Layer } from "effect"
import { FetchHttpClient } from "effect/http"
import { HttpApiBuilder } from "effect/http-api"

import { withApiInfrastructureErrors } from "../common/api-infrastructure-errors.js"
import { getWikiArticleDebug } from "./debug.js"
import { GoogleBooks, GoogleBooksLive } from "./external-data/services/google-books.js"
import { WikiArticlesService } from "./service.js"

export const WikiApiLive = HttpApiBuilder.group(GororobasApi, "wiki", (handlers) =>
  Effect.gen(function* () {
    const books = yield* GoogleBooks

    return handlers
      .handle("suggestBookIds", ({ query }) =>
        books
          .suggestIds(query.title)
          .pipe(withApiInfrastructureErrors({ group: "wiki", endpoint: "suggestBookIds" })),
      )
      .handle("getWikiArticleDebug", ({ params }) =>
        getWikiArticleDebug(params.wikiArticleId).pipe(
          withApiInfrastructureErrors({ group: "wiki", endpoint: "getWikiArticleDebug" }),
        ),
      )
      .handle("getWikiBookmarks", () =>
        WikiArticlesService.use((service) => service.listBookmarks).pipe(
          withApiInfrastructureErrors({ group: "wiki", endpoint: "getWikiBookmarks" }),
        ),
      )
      .handle("getWikiRevisionHistory", ({ params }) =>
        WikiArticlesService.use((service) =>
          Effect.gen(function* () {
            const article = yield* service.getPage({ ...params, language: "pt" })
            return yield* service.listRevisionHistory({
              wikiArticleId: article.id,
              evaluation: "APPROVED",
            })
          }),
        ).pipe(withApiInfrastructureErrors({ group: "wiki", endpoint: "getWikiRevisionHistory" })),
      )
      .handle("searchWikiArticles", ({ query }) =>
        WikiArticlesService.use((service) => service.searchWikiArticles(query)).pipe(
          withApiInfrastructureErrors({ group: "wiki", endpoint: "searchWikiArticles" }),
        ),
      )
      .handle("getWikiArticleByHandleAndKind", ({ params, query }) =>
        WikiArticlesService.use((service) =>
          service.getPage({ ...params, language: query.language ?? "pt" }),
        ).pipe(
          withApiInfrastructureErrors({ group: "wiki", endpoint: "getWikiArticleByHandleAndKind" }),
        ),
      )
      .handle("listRelatedWikiArticles", ({ params, query }) =>
        WikiArticlesService.use((service) =>
          service.listRelatedWikiArticles({ ...params, language: query.language ?? "pt" }),
        ).pipe(withApiInfrastructureErrors({ group: "wiki", endpoint: "listRelatedWikiArticles" })),
      )
      .handle("createWikiArticle", ({ payload }) =>
        WikiArticlesService.use((service) => service.createWikiArticle(payload)).pipe(
          Effect.map((id) => ({ id })),
          withApiInfrastructureErrors({ group: "wiki", endpoint: "createWikiArticle" }),
        ),
      )
      .handle("createWikiArticleRevision", ({ params, payload }) =>
        WikiArticlesService.use((service) =>
          Effect.gen(function* () {
            const article = yield* service.getPage({ ...params, language: "pt" })
            const id = yield* service.createRevision(article.id, payload)
            return { id }
          }),
        ).pipe(
          withApiInfrastructureErrors({ group: "wiki", endpoint: "createWikiArticleRevision" }),
        ),
      )
      .handle("evaluateWikiArticleRevision", ({ params, payload }) =>
        WikiArticlesService.use((service) =>
          Effect.gen(function* () {
            yield* service.evaluateRevision(params.revisionId, payload)

            return { id: params.revisionId }
          }),
        ).pipe(
          withApiInfrastructureErrors({ group: "wiki", endpoint: "evaluateWikiArticleRevision" }),
        ),
      )
      .handle("toggleWikiArticleBookmark", ({ params }) =>
        WikiArticlesService.use((service) =>
          Effect.gen(function* () {
            const article = yield* service.getPage({ ...params, language: "pt" })
            yield* service.toggleBookmark(article.id)

            return true as const
          }),
        ).pipe(
          withApiInfrastructureErrors({ group: "wiki", endpoint: "toggleWikiArticleBookmark" }),
        ),
      )
      .handle("setMainMedia", ({ params, payload }) =>
        WikiArticlesService.use((service) => service.setMainMedia({ ...params, ...payload })).pipe(
          withApiInfrastructureErrors({ group: "wiki", endpoint: "setMainMedia" }),
        ),
      )
  }),
).pipe(Layer.provide(GoogleBooksLive.pipe(Layer.provide(FetchHttpClient.layer))))
