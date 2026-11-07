import type { Block } from "foldkit"

import { PopoverDrawerBlock } from "../../ui/popover-drawer"
import { ProfileBlock } from "./definition"
import { ObserveCollectionEnd } from "./mount"

/** A photo's credit: who took it and its license, behind a badge over its corner. */
export const photoCreditId = (mediaAssetId: string) => `profile-photo-credit-${mediaAssetId}`

/** One per photo shown, created as each page of photos loads. */
export const PhotoCreditsBinding = ProfileBlock.makeBinding(PopoverDrawerBlock, {
  field: "photoCredits",
  key: "id",
  init: { instances: () => [], toItem: (_occurrence, credit) => credit },
})

export const ProfileComposition = ProfileBlock.makeComposition({
  bindings: [PhotoCreditsBinding],
  mounts: [ObserveCollectionEnd],
})
export type ProfileViewBuilder = Block.ViewBuilderFor<typeof ProfileComposition>
