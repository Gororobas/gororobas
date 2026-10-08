import { GororobasApi } from "@gororobas/domain"
import { Layer } from "effect"
import { HttpRouter } from "effect/http"
import { HttpApi, HttpApiBuilder } from "effect/http-api"

import { MediaAssetsApiLive } from "./media-assets/api-live.js"
import { MediaAssetsRepository } from "./media-assets/repository.js"
import { MediaAssetsService } from "./media-assets/service.js"
import { MediaAssetsStorage } from "./media-assets/storage.js"
import { OrganizationsApiLive } from "./organizations/api-live.js"
import { PeopleApiLive } from "./people/api-live.js"
import { ProfilesApiLive } from "./profiles/api-live.js"
import { ProfilesRepository } from "./profiles/repository.js"
import { PublicationCommentsApiLive } from "./publication-comments/api-live.js"
import { PublicationCommentsRepository } from "./publication-comments/repository.js"
import { PublicationCommentsService } from "./publication-comments/service.js"
import { PublicationsApiLive } from "./publications/api-live.js"
import { PublicationsRepository } from "./publications/repository.js"
import { PublicationsService } from "./publications/service.js"
import { TagsApiLive } from "./tags/api-live.js"

// Register the implemented API groups.
const ImplementedApi = HttpApi.make(GororobasApi.identifier).add(
  GororobasApi.groups.publicationComments,
  GororobasApi.groups.mediaAssets,
  GororobasApi.groups.organizations,
  GororobasApi.groups.people,
  GororobasApi.groups.publications,
  GororobasApi.groups.profiles,
  GororobasApi.groups.tags,
)

const MediaServicesLive = Layer.effect(MediaAssetsService, MediaAssetsService.make).pipe(
  Layer.provideMerge(Layer.effect(MediaAssetsRepository, MediaAssetsRepository.make)),
  Layer.provideMerge(Layer.effect(MediaAssetsStorage, MediaAssetsStorage.make)),
)

export const ApiLive = Layer.provide(HttpApiBuilder.layer(ImplementedApi), [
  PublicationCommentsApiLive,
  MediaAssetsApiLive,
  OrganizationsApiLive,
  PeopleApiLive,
  PublicationsApiLive,
  ProfilesApiLive,
  TagsApiLive,
]).pipe(
  HttpRouter.provideRequest(
    Layer.mergeAll(
      MediaServicesLive,
      Layer.effect(PublicationCommentsService, PublicationCommentsService.make),
      Layer.effect(PublicationsService, PublicationsService.make),
      Layer.effect(ProfilesRepository, ProfilesRepository.make),
    ),
  ),
  Layer.provideMerge(Layer.effect(PublicationsRepository, PublicationsRepository.make)),
  Layer.provideMerge(
    Layer.effect(PublicationCommentsRepository, PublicationCommentsRepository.make),
  ),
)

export const ApiTest = ApiLive
