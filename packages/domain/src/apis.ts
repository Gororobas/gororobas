import { HttpApi } from "@effect/platform"

import { AuthenticationMiddleware } from "./authentication/middleware.js"
import { UnauthorizedError } from "./authorization/session.js"
import { CommentsApiGroup } from "./comments/api.js"
import { MediaApiGroup } from "./media/api.js"
import { OrganizationsApiGroup } from "./organizations/api.js"
import { PeopleApiGroup } from "./people/api.js"
import { PostsApiGroup } from "./posts/api.js"
import { ProfilesApiGroup } from "./profiles/api.js"
import { ResourcesApiGroup } from "./resources/api.js"
import { TagsApiGroup } from "./tags/api.js"
import { VegetablesApiGroup } from "./vegetables/api.js"

export const GororobasApi = HttpApi.make("GororobasApi")
  .add(CommentsApiGroup)
  .add(MediaApiGroup)
  .add(OrganizationsApiGroup)
  .add(PeopleApiGroup)
  .add(PostsApiGroup)
  .add(ResourcesApiGroup)
  .add(VegetablesApiGroup)
  .add(ProfilesApiGroup)
  .add(TagsApiGroup)
  .middleware(AuthenticationMiddleware)
  .addError(UnauthorizedError)
