import { Block } from "foldkit"

import { Message } from "./message"
import { Model } from "./model"

export const MyPlacesDefinition = Block.makeDefinition("MyPlaces", { Model, Message })

export const { makeFieldsStep, makeNoopStep, makeStep } = MyPlacesDefinition
