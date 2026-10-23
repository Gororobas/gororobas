import { GororobasApi } from "@gororobas/domain"
import { Layer } from "effect"
import { HttpRouter } from "effect/http"
import { HttpApi, HttpApiBuilder } from "effect/http-api"

import { MediaAssetsApiLive } from "./media-assets/api-live.js"
import { MediaAssetsRepository } from "./media-assets/repository.js"
import { MediaAssetsService } from "./media-assets/service.js"
import { MediaAssetsStorage } from "./media-assets/storage.js"
import { ModerationApiLive } from "./moderation/api-live.js"
import { ModerationService } from "./moderation/service.js"
import { OrganizationsApiLive } from "./organizations/api-live.js"
import { OrganizationsRepository } from "./organizations/repository.js"
import { OrganizationsService } from "./organizations/service.js"
import { PeopleApiLive } from "./people/api-live.js"
import { PeopleRepository } from "./people/repository.js"
import { PeopleService } from "./people/service.js"
import { ProfilesApiLive } from "./profiles/api-live.js"
import { ProfilesRepository } from "./profiles/repository.js"
import { ProfileService } from "./profiles/service.js"
import { PublicationCommentsApiLive } from "./publication-comments/api-live.js"
import { PublicationCommentsRepository } from "./publication-comments/repository.js"
import { PublicationCommentsService } from "./publication-comments/service.js"
import { PublicationsApiLive } from "./publications/api-live.js"
import { PublicationsRepository } from "./publications/repository.js"
import { PublicationsService } from "./publications/service.js"
import { WikiApiLive } from "./wiki/api-live.js"
import { WikiArticlesRepository } from "./wiki/repository.js"
import { WikiArticlesService } from "./wiki/service.js"

// Register the implemented API groups.
const ImplementedApi = HttpApi.make(GororobasApi.identifier).add(
  GororobasApi.groups.publicationComments,
  GororobasApi.groups.mediaAssets,
  GororobasApi.groups.moderation,
  GororobasApi.groups.organizations,
  GororobasApi.groups.people,
  GororobasApi.groups.publications,
  GororobasApi.groups.profiles,
  GororobasApi.groups.wiki,
)

const MediaServicesLive = Layer.effect(MediaAssetsService, MediaAssetsService.make).pipe(
  Layer.provideMerge(Layer.effect(MediaAssetsRepository, MediaAssetsRepository.make)),
  Layer.provideMerge(Layer.effect(MediaAssetsStorage, MediaAssetsStorage.make)),
)

const RepositoriesLive = Layer.mergeAll(
  Layer.effect(OrganizationsRepository, OrganizationsRepository.make),
  Layer.effect(PeopleRepository, PeopleRepository.make),
  Layer.effect(ProfilesRepository, ProfilesRepository.make),
  Layer.effect(WikiArticlesRepository, WikiArticlesRepository.make),
)

const ServicesLive = Layer.mergeAll(
  Layer.effect(ModerationService, ModerationService.make),
  Layer.effect(OrganizationsService, OrganizationsService.make),
  Layer.effect(PeopleService, PeopleService.make),
  Layer.effect(ProfileService, ProfileService.make),
  Layer.effect(PublicationCommentsService, PublicationCommentsService.make),
  Layer.effect(PublicationsService, PublicationsService.make),
  Layer.effect(WikiArticlesService, WikiArticlesService.make),
).pipe(Layer.provideMerge(MediaServicesLive), Layer.provideMerge(RepositoriesLive))

export const ApiLive = Layer.provide(HttpApiBuilder.layer(ImplementedApi), [
  PublicationCommentsApiLive,
  MediaAssetsApiLive,
  ModerationApiLive,
  OrganizationsApiLive,
  PeopleApiLive,
  PublicationsApiLive,
  ProfilesApiLive,
  WikiApiLive,
]).pipe(
  HttpRouter.provideRequest(ServicesLive),
  Layer.provideMerge(Layer.effect(PublicationsRepository, PublicationsRepository.make)),
  Layer.provideMerge(
    Layer.effect(PublicationCommentsRepository, PublicationCommentsRepository.make),
  ),
)
