import type { Block } from "foldkit"

import { ProfileAboutEditorBlock } from "./definition"

export const ProfileAboutEditorComposition = ProfileAboutEditorBlock.makeComposition()
export type ProfileAboutEditorViewBuilder = Block.ViewBuilderFor<
  typeof ProfileAboutEditorComposition
>
