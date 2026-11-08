import { Schema } from "effect"
import { Block } from "foldkit"

import { GororobasApiClient } from "../../../../api-client"
import type { LanguageInputs } from "../../../../lib/language"
import { Message, OutMessage } from "./message"
import { Model } from "./model"

export const ProfileSettingsEditorKey = Symbol("ProfileSettingsEditor")

/** Who sees the signed-in person's profile and what they save, their language and their account. */
export const ProfileSettingsEditorBlock = Block.make("ProfileSettingsEditor", {
  key: ProfileSettingsEditorKey,
  Init: Schema.Tuple([]),
  view: { kind: "Element", Inputs: Block.makeInputContract<LanguageInputs>() },
  effects: { services: [GororobasApiClient] },
  Model,
  Message,
  OutMessage,
})

export const { makeFieldsStep, makeStep } = ProfileSettingsEditorBlock
