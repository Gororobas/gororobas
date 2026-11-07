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
  Init: Schema.Tuple([Handle, SupportedLanguage]),
  view: { kind: "Element", Inputs: Block.makeInputContract<ViewInputs>() },
  effects: { services: [GororobasApiClient] },
  Model,
  Message,
})

export const { makeFieldsStep, makeStep } = ProfileBlock
