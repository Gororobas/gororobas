import { Schema } from "effect"
import { Block } from "foldkit"

import { GororobasApiClient } from "../../../../api-client"
import type { LanguageInputs } from "../../../../lib/language"
import { SessionAccess } from "../../../../session-access"
import { Message } from "./message"
import { Model } from "./model"

export const ProfileAboutEditorKey = Symbol("ProfileAboutEditor")

/** How the signed-in person presents themself: name, handle, photo and bio. */
export const ProfileAboutEditorBlock = Block.make("ProfileAboutEditor", {
  key: ProfileAboutEditorKey,
  Init: Schema.Tuple([]),
  view: { kind: "Element", Inputs: Block.makeInputContract<LanguageInputs>() },
  effects: { services: [GororobasApiClient, SessionAccess] },
  Model,
  Message,
})

export const { makeFieldsStep, makeStep } = ProfileAboutEditorBlock
