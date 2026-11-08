import type { Block } from "foldkit"

import { ProfileSettingsEditorBlock } from "./definition"

export const ProfileSettingsEditorComposition = ProfileSettingsEditorBlock.makeComposition()
export type ProfileSettingsEditorViewBuilder = Block.ViewBuilderFor<
  typeof ProfileSettingsEditorComposition
>
