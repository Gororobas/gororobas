import { HttpApi } from "effect/unstable/httpapi"

import { AuthenticationMiddleware } from "./authentication/middleware.js"
import { CommentsApiGroup } from "./comments/api.js"
import { MediaApiGroup } from "./media/api.js"
import { OrganizationsApiGroup } from "./organizations/api.js"
import { PeopleApiGroup } from "./people/api.js"
import { ProfilesApiGroup } from "./profiles/api.js"
import { PublicationsApiGroup } from "./publications/api.js"
import { TagsApiGroup } from "./tags/api.js"
import { WikiApiGroup } from "./wiki/api.js"

export const GororobasApi = HttpApi.make("GororobasApi")
  .add(CommentsApiGroup)
  .add(MediaApiGroup)
  .add(OrganizationsApiGroup)
  .add(PeopleApiGroup)
  .add(PublicationsApiGroup)
  .add(WikiApiGroup)
  .add(ProfilesApiGroup)
  .add(TagsApiGroup)
  .middleware(AuthenticationMiddleware)
