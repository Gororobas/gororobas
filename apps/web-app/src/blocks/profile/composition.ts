import type { Block } from "foldkit"

import { ProfileBlock } from "./definition"

export const ProfileComposition = ProfileBlock.makeComposition()
export type ProfileViewBuilder = Block.ViewBuilderFor<typeof ProfileComposition>
