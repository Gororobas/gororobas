import type { Block } from "foldkit"

import { AuthenticationBlock } from "./definition"

export const AuthenticationComposition = AuthenticationBlock.makeComposition()
export type AuthenticationViewBuilder = Block.ViewBuilderFor<typeof AuthenticationComposition>
