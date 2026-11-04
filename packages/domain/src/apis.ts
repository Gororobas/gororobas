import { HttpApi } from "effect/http-api"

import { ApiAuthentication } from "./authentication/middleware.js"
import { MediaAssetsApi } from "./media-assets/api.js"
import { ModerationApiGroup } from "./moderation/api.js"
import { OrganizationsApiGroup } from "./organizations/api.js"
import { PeopleApiGroup } from "./people/api.js"
import { PlacesApiGroup } from "./places/api.js"
import { ProfilesApiGroup } from "./profiles/api.js"
import { ProfileLocationsApiGroup } from "./profiles/locations-api.js"
import { PublicationCommentsApiGroup } from "./publication-comments/api.js"
import { PublicationsApiGroup } from "./publications/api.js"
import { WikiApiGroup } from "./wiki/api.js"

export const GororobasApi = HttpApi.make("GororobasApi")
  .add(PublicationCommentsApiGroup)
  .add(OrganizationsApiGroup)
  .add(PeopleApiGroup)
  .add(PublicationsApiGroup)
  .add(WikiApiGroup)
  .add(ProfilesApiGroup)
  .add(ProfileLocationsApiGroup)
  .add(PlacesApiGroup)
  .add(MediaAssetsApi)
  .add(ModerationApiGroup)
  .middleware(ApiAuthentication)
