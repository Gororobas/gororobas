import { GororobasApi } from "@gororobas/domain"
import { Effect } from "effect"
import { HttpApiBuilder } from "effect/http-api"

import { withApiInfrastructureErrors } from "../common/api-infrastructure-errors.js"
import { PublicationsService } from "./service.js"

export const PublicationsApiLive = HttpApiBuilder.group(GororobasApi, "publications", (handlers) =>
  handlers
    .handle("searchPublications", ({ query }) =>
      Effect.gen(function* () {
        yield* Effect.annotateCurrentSpan("publications.search.has_text", query.text !== undefined)
        yield* Effect.annotateCurrentSpan("publications.search.kind", query.kind ?? "all")
        const service = yield* PublicationsService
        const publications = yield* service.searchPublications(query)
        yield* Effect.annotateCurrentSpan("publications.search.result_count", publications.length)
        return publications
      }).pipe(
        Effect.withSpan("publications.search"),
        withApiInfrastructureErrors({ group: "publications", endpoint: "searchPublications" }),
      ),
    )
    .handle("getPublication", ({ params }) =>
      PublicationsService.use((service) => service.getPublicationData(params.id)).pipe(
        withApiInfrastructureErrors({ group: "publications", endpoint: "getPublication" }),
      ),
    )
    .handle("getPublicationByHandle", ({ params }) =>
      PublicationsService.use((service) =>
        Effect.gen(function* () {
          const row = yield* service.getPublicationByHandle(params.handle)
          return yield* service.getPublicationData(row.id)
        }),
      ).pipe(
        withApiInfrastructureErrors({ group: "publications", endpoint: "getPublicationByHandle" }),
      ),
    )
    .handle("createPublication", ({ params, payload }) =>
      PublicationsService.use((service) =>
        Effect.gen(function* () {
          const created = yield* service.createPublication({
            ...payload,
            ownerProfileId: params.profileId,
            sourceLanguage: payload.sourceLanguage,
          })

          return yield* service.getPublicationData(created.id)
        }),
      ).pipe(withApiInfrastructureErrors({ group: "publications", endpoint: "createPublication" })),
    )
    .handle("updatePublication", ({ params, payload }) =>
      PublicationsService.use((service) =>
        Effect.gen(function* () {
          yield* service.updatePublication({ ...payload, publicationId: params.id })
          return yield* service.getPublicationData(params.id)
        }),
      ).pipe(withApiInfrastructureErrors({ group: "publications", endpoint: "updatePublication" })),
    )
    .handle("deletePublication", ({ params }) =>
      PublicationsService.use((service) => service.delete(params.id)).pipe(
        withApiInfrastructureErrors({ group: "publications", endpoint: "deletePublication" }),
      ),
    )
    .handle("moderatePublication", ({ params, payload }) =>
      PublicationsService.use((service) => service.moderate({ ...params, ...payload })).pipe(
        withApiInfrastructureErrors({ group: "publications", endpoint: "moderatePublication" }),
      ),
    )
    .handle("getPublicationHistory", ({ params }) =>
      PublicationsService.use((service) => service.getApiHistory(params.id)).pipe(
        withApiInfrastructureErrors({ group: "publications", endpoint: "getPublicationHistory" }),
      ),
    ),
)
