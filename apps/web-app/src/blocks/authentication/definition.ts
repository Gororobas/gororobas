import { Block } from "foldkit"

import { Message } from "./message"
import { Model } from "./model"

export const AuthenticationDefinition = Block.makeDefinition("Authentication", { Model, Message })
