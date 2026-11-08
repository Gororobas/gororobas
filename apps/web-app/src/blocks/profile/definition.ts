import { SupportedLanguage } from "@gororobas/domain/common/enums"
import { Handle } from "@gororobas/domain/common/primitives"
import { Schema } from "effect"
import { Block } from "foldkit"

import { GororobasApiClient } from "../../api-client"
import { Message } from "./message"
import { Model } from "./model"
import type { ViewInputs } from "./view/view"

export const ProfileKey = Symbol("Profile")

export const ProfileBlock = Block.make("Profile", {
  key: ProfileKey,
  /** Content loads in the language the app is read in, which also sets the block's key. */
  InitArgs: Schema.Tuple([Handle, SupportedLanguage]),
  /** Follow-up requests, such as the profile's posts, load in that same language. */
  Context: Schema.Tuple([SupportedLanguage]),
  view: { kind: "Element", Inputs: Block.makeInputContract<ViewInputs>() },
  effects: { services: [GororobasApiClient] },
  Model,
  Message,
})

export const { makeFieldsStep, makeStep } = ProfileBlock
