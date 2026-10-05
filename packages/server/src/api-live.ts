import { GororobasApi } from "@gororobas/domain"
import { Layer } from "effect"
import { HttpApiBuilder } from "effect/http-api"

import { AuthenticationMiddlewareLive } from "./authentication/authentication-middleware-live.js"
import { CommentsApiLive } from "./comments/api-live.js"
import { CommentsRepository } from "./comments/repository.js"
import { MediaAssetsApiLive } from "./media-assets/api-live.js"
import { MediaAssetsRepository } from "./media-assets/repository.js"
import { MediaAssetsService } from "./media-assets/service.js"
import { MediaAssetsStorage } from "./media-assets/storage.js"
import { OrganizationsApiLive } from "./organizations/api-live.js"
import { PeopleApiLive } from "./people/api-live.js"
import { ProfilesApiLive } from "./profiles/api-live.js"
import { PublicationsApiLive } from "./publications/api-live.js"
import { PublicationsRepository } from "./publications/repository.js"
import { TagsApiLive } from "./tags/api-live.js"

export const ApiLive = Layer.provide(HttpApiBuilder.layer(GororobasApi), [
  AuthenticationMiddlewareLive,
  CommentsApiLive,
  MediaAssetsApiLive,
  OrganizationsApiLive,
  PeopleApiLive,
  PublicationsApiLive,
  ProfilesApiLive,
  TagsApiLive,
]).pipe(
  Layer.provideMerge(Layer.effect(MediaAssetsService, MediaAssetsService.make)),
  Layer.provideMerge(Layer.effect(MediaAssetsRepository, MediaAssetsRepository.make)),
  Layer.provideMerge(Layer.effect(MediaAssetsStorage, MediaAssetsStorage.make)),
  Layer.provideMerge(Layer.effect(PublicationsRepository, PublicationsRepository.make)),
  Layer.provideMerge(Layer.effect(CommentsRepository, CommentsRepository.make)),
)

export const ApiTest = ApiLive
