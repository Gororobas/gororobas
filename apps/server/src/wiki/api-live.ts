import { GororobasApi } from "@gororobas/domain"
import { Effect } from "effect"
import { HttpApiBuilder } from "effect/http-api"

import { withApiInfrastructureErrors } from "../common/api-infrastructure-errors.js"
import { WikiArticlesService } from "./service.js"

export const WikiApiLive = HttpApiBuilder.group(GororobasApi, "wiki", (handlers) =>
  handlers
    .handle("searchWikiArticles", () =>
      WikiArticlesService.use((service) => service.listCards("pt")).pipe(
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
      ).pipe(withApiInfrastructureErrors({ group: "wiki", endpoint: "createWikiArticleRevision" })),
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
      ).pipe(withApiInfrastructureErrors({ group: "wiki", endpoint: "toggleWikiArticleBookmark" })),
    )
    .handle("setMainMedia", ({ params, payload }) =>
      WikiArticlesService.use((service) => service.setMainMedia({ ...params, ...payload })).pipe(
        withApiInfrastructureErrors({ group: "wiki", endpoint: "setMainMedia" }),
      ),
    ),
)
