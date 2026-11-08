import { Option } from "effect"

import { ProfileAboutEditorComposition } from "./composition"
import { HandleCheck, Profile, SaveStatus } from "./model"

export const init = ProfileAboutEditorComposition.makeInit(() => ({
  model: {
    profile: Profile.Loading(),
    reloadCount: 0,
    form: { name: "", handle: "", bio: "", maybePhotoId: Option.none() },
    handleCheck: HandleCheck.Unchanged(),
    photoUpload: "Idle",
    save: SaveStatus.Idle(),
  },
}))
