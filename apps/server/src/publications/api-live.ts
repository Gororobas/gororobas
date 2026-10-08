import { GororobasApi } from "@gororobas/domain"
import { Effect } from "effect"
import { HttpApiBuilder } from "effect/http-api"

import { withApiInfrastructureErrors } from "../common/api-infrastructure-errors.js"
import { PublicationsService } from "./service.js"

export const PublicationsApiLive = HttpApiBuilder.group(GororobasApi, "publications", (handlers) =>
  handlers
    .handle("searchPublications", () => Effect.succeed([]))
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
    .handle("getPublicationHistory", () => Effect.die("stub")),
)
