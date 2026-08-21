import { GororobasApi } from "@gororobas/domain"
import { Layer } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"

import { AuthenticationMiddlewareLive } from "./authentication/authentication-middleware-live.js"
import { CommentsApiLive } from "./comments/api-live.js"
import { CommentsRepository } from "./comments/repository.js"
import { MediaApiLive } from "./media/api-live.js"
import { OrganizationsApiLive } from "./organizations/api-live.js"
import { PeopleApiLive } from "./people/api-live.js"
import { ProfilesApiLive } from "./profiles/api-live.js"
import { PublicationsApiLive } from "./publications/api-live.js"
import { PublicationsRepository } from "./publications/repository.js"
import { ResourcesApiLive } from "./resources/api-live.js"
import { TagsApiLive } from "./tags/api-live.js"
import { VegetablesApiLive } from "./vegetables/api-live.js"

export const ApiLive = Layer.provide(HttpApiBuilder.layer(GororobasApi), [
  AuthenticationMiddlewareLive,
  CommentsApiLive,
  MediaApiLive,
  OrganizationsApiLive,
  PeopleApiLive,
  PublicationsApiLive,
  ProfilesApiLive,
  ResourcesApiLive,
  TagsApiLive,
  VegetablesApiLive,
]).pipe(
  Layer.provideMerge(Layer.effect(PublicationsRepository, PublicationsRepository.make)),
  Layer.provideMerge(Layer.effect(CommentsRepository, CommentsRepository.make)),
)

export const ApiTest = ApiLive
