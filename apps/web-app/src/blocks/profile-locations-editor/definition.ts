import { Block } from "foldkit"

import { Message, OutMessage } from "./message"
import { Model } from "./model"

export const ProfileLocationsEditorDefinition = Block.makeDefinition("ProfileLocationsEditor", {
  Model,
  Message,
  OutMessage,
})

export const { makeFieldsStep, makeNoopStep, makeOutMessageStep, makeStep } =
  ProfileLocationsEditorDefinition
