import { assertAuthenticated, GororobasApi } from "@gororobas/domain"
import { Effect } from "effect"
import { HttpApiBuilder } from "effect/http-api"

import { withApiInfrastructureErrors } from "../common/api-infrastructure-errors.js"
import { requestLocale } from "../places/request-locale.js"
import { ProfileLocationsService } from "./locations-service.js"

export const ProfileLocationsApiLive = HttpApiBuilder.group(
  GororobasApi,
  "profileLocations",
  (handlers) =>
    handlers
      .handle("listMyLocations", () =>
        Effect.gen(function* () {
          const session = yield* assertAuthenticated
          const { language } = yield* requestLocale
          return yield* (yield* ProfileLocationsService).list({
            profileId: session.personId,
            language,
          })
        }).pipe(
          withApiInfrastructureErrors({ endpoint: "listMyLocations", group: "profileLocations" }),
        ),
      )
      .handle("addMyLocation", ({ payload }) =>
        Effect.gen(function* () {
          const session = yield* assertAuthenticated
          const { language } = yield* requestLocale

          return yield* (yield* ProfileLocationsService).add({
            profileId: session.personId,
            payload,
            language,
          })
        }).pipe(
          withApiInfrastructureErrors({ endpoint: "addMyLocation", group: "profileLocations" }),
        ),
      )
      .handle("updateMyLocation", ({ params, payload }) =>
        Effect.gen(function* () {
          const session = yield* assertAuthenticated
          const { language } = yield* requestLocale

          return yield* (yield* ProfileLocationsService).update({
            profileId: session.personId,
            id: params.id,
            payload,
            language,
          })
        }).pipe(
          withApiInfrastructureErrors({ endpoint: "updateMyLocation", group: "profileLocations" }),
        ),
      )
      .handle("deleteMyLocation", ({ params }) =>
        Effect.gen(function* () {
          const session = yield* assertAuthenticated
          yield* (yield* ProfileLocationsService).remove({
            profileId: session.personId,
            id: params.id,
          })
        }).pipe(
          withApiInfrastructureErrors({ endpoint: "deleteMyLocation", group: "profileLocations" }),
        ),
      ),
)
