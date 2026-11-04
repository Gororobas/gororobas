import { Schema } from "effect"
import { Block } from "foldkit"

import { GororobasApiClient } from "../../api-client"
import { AuthenticationClient, SessionAccess } from "../../session-access"
import { InMessage } from "./in-message"
import { Message } from "./message"
import { Model } from "./model"

export const AuthenticationKey = Symbol("Authentication")

export const AuthenticationBlock = Block.make("Authentication", {
  key: AuthenticationKey,
  Init: Schema.Tuple([]),
  view: { kind: "Element" },
  effects: { services: [AuthenticationClient, GororobasApiClient, SessionAccess] },
  InMessage,
  Model,
  Message,
})
