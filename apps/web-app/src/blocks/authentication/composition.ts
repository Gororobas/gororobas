import type { Block } from "foldkit"

import { AuthenticationDefinition } from "./definition"

export const AuthenticationComposition = AuthenticationDefinition.makeComposition()
export type AuthenticationViewBuilder = Block.ViewBuilderFor<typeof AuthenticationComposition>
