import { GororobasApi } from "@gororobas/domain"
import { Effect, Layer } from "effect"
import { FetchHttpClient } from "effect/http"
import { HttpApiBuilder } from "effect/http-api"

import { withApiInfrastructureErrors } from "../common/api-infrastructure-errors.js"
import { requestLocale } from "../common/request-locale.js"
import { getWikiArticleDebug } from "./debug.js"
import { GoogleBooks, GoogleBooksLive } from "./external-data/services/google-books.js"
import { getArticleExternalData, getObservation, listObservations } from "./external-data/views.js"
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
            const article = yield* service.findPage({
              ...params,
              language: (yield* requestLocale).language,
            })
            return yield* service.listRevisionHistory({
              wikiArticleId: article.id,
              evaluation: "APPROVED",
            })
          }),
        ).pipe(withApiInfrastructureErrors({ group: "wiki", endpoint: "getWikiRevisionHistory" })),
      )
      .handle("searchWikiArticles", ({ query }) =>
        WikiArticlesService.use((service) =>
          Effect.gen(function* () {
            return yield* service.searchWikiArticles({
              ...query,
              language: query.language ?? (yield* requestLocale).language,
            })
          }),
        ).pipe(withApiInfrastructureErrors({ group: "wiki", endpoint: "searchWikiArticles" })),
      )
      .handle("getWikiArticleByHandleAndKind", ({ params, query }) =>
        WikiArticlesService.use((service) =>
          Effect.gen(function* () {
            return yield* service.getPage({
              ...params,
              language: query.language ?? (yield* requestLocale).language,
            })
          }),
        ).pipe(
          withApiInfrastructureErrors({ group: "wiki", endpoint: "getWikiArticleByHandleAndKind" }),
        ),
      )
      .handle("listRelatedWikiArticles", ({ params, query }) =>
        WikiArticlesService.use((service) =>
          Effect.gen(function* () {
            return yield* service.listRelatedWikiArticles({
              ...params,
              language: query.language ?? (yield* requestLocale).language,
            })
          }),
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
            const article = yield* service.findPage({
              ...params,
              language: (yield* requestLocale).language,
            })
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
      .handle("setWikiArticleBookmark", ({ params, payload }) =>
        WikiArticlesService.use((service) =>
          Effect.gen(function* () {
            return yield* service
              .findPage({ ...params, language: (yield* requestLocale).language })
              .pipe(Effect.flatMap((article) => service.bookmark(article.id, payload.state)))
          }),
        ).pipe(withApiInfrastructureErrors({ group: "wiki", endpoint: "setWikiArticleBookmark" })),
      )
      .handle("removeWikiArticleBookmark", ({ params }) =>
        WikiArticlesService.use((service) =>
          Effect.gen(function* () {
            return yield* service
              .findPage({ ...params, language: (yield* requestLocale).language })
              .pipe(Effect.flatMap((article) => service.removeBookmark(article.id)))
          }),
        ).pipe(
          withApiInfrastructureErrors({ group: "wiki", endpoint: "removeWikiArticleBookmark" }),
        ),
      )
      .handle("listWikiArticleBookmarkers", ({ params }) =>
        WikiArticlesService.use((service) =>
          Effect.gen(function* () {
            return yield* service.listBookmarkers({
              ...params,
              language: (yield* requestLocale).language,
            })
          }),
        ).pipe(
          withApiInfrastructureErrors({ group: "wiki", endpoint: "listWikiArticleBookmarkers" }),
        ),
      )
      .handle("listWikiArticleContributors", ({ params }) =>
        WikiArticlesService.use((service) =>
          Effect.gen(function* () {
            return yield* service.listContributors({
              ...params,
              language: (yield* requestLocale).language,
            })
          }),
        ).pipe(
          withApiInfrastructureErrors({ group: "wiki", endpoint: "listWikiArticleContributors" }),
        ),
      )
      .handle("listWikiArticleCultivars", ({ params, query }) =>
        WikiArticlesService.use((service) =>
          service.listCultivarCards({ ...params, language: query.language }),
        ).pipe(
          withApiInfrastructureErrors({ group: "wiki", endpoint: "listWikiArticleCultivars" }),
        ),
      )
      .handle("listWikiArticleChildPlaces", ({ params, query }) =>
        WikiArticlesService.use((service) => service.listChildPlaces({ ...params, ...query })).pipe(
          withApiInfrastructureErrors({ group: "wiki", endpoint: "listWikiArticleChildPlaces" }),
        ),
      )
      .handle("getWikiArticleExternalData", ({ params }) =>
        WikiArticlesService.use((service) =>
          Effect.gen(function* () {
            const article = yield* service.findPage({
              ...params,
              language: (yield* requestLocale).language,
            })
            return yield* getArticleExternalData(article.id)
          }),
        ).pipe(
          withApiInfrastructureErrors({ group: "wiki", endpoint: "getWikiArticleExternalData" }),
        ),
      )
      .handle("listExternalDataObservations", ({ query }) =>
        listObservations(query).pipe(
          withApiInfrastructureErrors({ group: "wiki", endpoint: "listExternalDataObservations" }),
        ),
      )
      .handle("getExternalDataObservation", ({ params }) =>
        getObservation(params.observationId).pipe(
          withApiInfrastructureErrors({ group: "wiki", endpoint: "getExternalDataObservation" }),
        ),
      )
      .handle("setMainMedia", ({ params, payload }) =>
        WikiArticlesService.use((service) => service.setMainMedia({ ...params, ...payload })).pipe(
          withApiInfrastructureErrors({ group: "wiki", endpoint: "setMainMedia" }),
        ),
      )
  }),
).pipe(Layer.provide(GoogleBooksLive.pipe(Layer.provide(FetchHttpClient.layer))))
