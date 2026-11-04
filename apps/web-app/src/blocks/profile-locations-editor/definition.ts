import { Schema } from "effect"
import { Block } from "foldkit"

import { GororobasApiClient } from "../../api-client"
import { DeviceLocation } from "../../lib/device-location"
import { InMessage } from "./in-message"
import { Message, OutMessage } from "./message"
import { Model } from "./model"
import type { ViewInputs } from "./view"

export const ProfileLocationsEditorKey = Symbol("ProfileLocationsEditor")

/** The signed-in person's location timeline: add, edit and remove where they are and have been. */
export const ProfileLocationsEditorBlock = Block.make("ProfileLocationsEditor", {
  key: ProfileLocationsEditorKey,
  Init: Schema.Tuple([]),
  /** The device's location is the application's: the editor reads it while handling Messages. */
  Context: Schema.Tuple([DeviceLocation]),
  InMessageContext: Schema.Tuple([DeviceLocation]),
  view: { kind: "Element", Inputs: Block.makeInputContract<ViewInputs>() },
  effects: { services: [GororobasApiClient] },
  InMessage,
  Model,
  Message,
  OutMessage,
})

export const { makeFieldsStep, makeNoopStep, makeOutMessageStep, makeStep } =
  ProfileLocationsEditorBlock
