import { Schema } from "effect"
import { Block } from "foldkit"

import { GororobasApiClient } from "../../api-client"
import { SessionAccess } from "../../session-access"
import { Message, OutMessage } from "./message"
import { Model } from "./model"
import type { ViewInputs } from "./view"

export const ProfileEditorKey = Symbol("ProfileEditor")

/** The signed-in person's account: how they present themself, where they are, their settings. */
export const ProfileEditorBlock = Block.make("ProfileEditor", {
  key: ProfileEditorKey,
  InitArgs: Schema.Tuple([]),
  view: { kind: "Element", Inputs: Block.makeInputContract<ViewInputs>() },
  /** What its sections' effects need. */
  effects: { services: [GororobasApiClient, SessionAccess] },
  Model,
  Message,
  OutMessage,
})

export const { makeFieldsStep, makeStep } = ProfileEditorBlock
