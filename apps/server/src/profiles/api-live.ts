import { assertAuthenticated, GororobasApi } from "@gororobas/domain"
import { Effect } from "effect"
import { HttpApiBuilder } from "effect/http-api"

import { withApiInfrastructureErrors } from "../common/api-infrastructure-errors.js"
import { requestLocale } from "../common/request-locale.js"
import { ProfileLocationsService } from "./locations-service.js"
import { ProfilesRepository } from "./repository.js"
import { ProfileService } from "./service.js"

export const ProfilesApiLive = HttpApiBuilder.group(GororobasApi, "profiles", (handlers) =>
  handlers
    .handle("searchProfiles", ({ query }) =>
      Effect.gen(function* () {
        yield* Effect.annotateCurrentSpan("profiles.search.has_text", query.text !== undefined)
        yield* Effect.annotateCurrentSpan("profiles.search.type", query.type ?? "all")
        const repo = yield* ProfilesRepository
        const { language } = yield* requestLocale
        const profiles = yield* repo.searchProfiles({ ...query, language })
        yield* Effect.annotateCurrentSpan("profiles.search.result_count", profiles.length)
        return profiles
      }).pipe(
        Effect.withSpan("profiles.search"),
        withApiInfrastructureErrors({ endpoint: "searchProfiles", group: "profiles" }),
      ),
    )
    .handle("getProfileByHandle", ({ params }) =>
      Effect.gen(function* () {
        const { language } = yield* requestLocale
        return yield* ProfileService.use((service) => service.getPage(params.handle, language))
      }).pipe(withApiInfrastructureErrors({ endpoint: "getProfileByHandle", group: "profiles" })),
    )
    .handle("listProfileBookmarks", ({ params, query }) =>
      ProfileService.use((service) => service.listBookmarks(params.handle, query.language)).pipe(
        withApiInfrastructureErrors({ endpoint: "listProfileBookmarks", group: "profiles" }),
      ),
    )
    .handle("listProfileWikiContributions", ({ params, query }) =>
      ProfileService.use((service) =>
        service.listWikiContributions(params.handle, query.language),
      ).pipe(
        withApiInfrastructureErrors({
          endpoint: "listProfileWikiContributions",
          group: "profiles",
        }),
      ),
    )
    .handle("listProfilePhotos", ({ params }) =>
      ProfileService.use((service) => service.listPhotos(params.handle)).pipe(
        withApiInfrastructureErrors({ endpoint: "listProfilePhotos", group: "profiles" }),
      ),
    )
    .handle("handleAvailability", ({ query }) =>
      Effect.gen(function* () {
        const repo = yield* ProfilesRepository

        return yield* repo
          .isHandleInUse(query.handle)
          .pipe(Effect.catchTag("NoSuchElementError", () => Effect.succeed(false)))
      }).pipe(
        withApiInfrastructureErrors({
          endpoint: "handleAvailability",
          group: "profiles",
        }),
      ),
    )
    .handle("listMyLocations", () =>
      Effect.gen(function* () {
        const session = yield* assertAuthenticated
        const { language } = yield* requestLocale
        return yield* (yield* ProfileLocationsService).list({
          profileId: session.personId,
          language,
        })
      }).pipe(withApiInfrastructureErrors({ endpoint: "listMyLocations", group: "profiles" })),
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
      }).pipe(withApiInfrastructureErrors({ endpoint: "addMyLocation", group: "profiles" })),
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
      }).pipe(withApiInfrastructureErrors({ endpoint: "updateMyLocation", group: "profiles" })),
    )
    .handle("deleteMyLocation", ({ params }) =>
      Effect.gen(function* () {
        const session = yield* assertAuthenticated
        yield* (yield* ProfileLocationsService).remove({
          profileId: session.personId,
          id: params.id,
        })
      }).pipe(withApiInfrastructureErrors({ endpoint: "deleteMyLocation", group: "profiles" })),
    ),
)
