import { SupportedLanguage } from "@gororobas/domain/common/enums"
import { Schema } from "effect"
import { Block } from "foldkit"

import { GororobasApiClient } from "../../api-client"
import type { LanguageInputs } from "../../lib/language"
import { AuthenticationClient, SessionAccess } from "../../session-access"
import { InMessage } from "./in-message"
import { Message, OutMessage } from "./message"
import { Model } from "./model"

export const AuthenticationKey = Symbol("Authentication")

export const AuthenticationBlock = Block.make("Authentication", {
  key: AuthenticationKey,
  Init: Schema.Tuple([]),
  /** Emails and new accounts speak the language the app is read in. */
  Context: Schema.Tuple([SupportedLanguage]),
  view: { kind: "Element", Inputs: Block.makeInputContract<LanguageInputs>() },
  effects: { services: [AuthenticationClient, GororobasApiClient, SessionAccess] },
  InMessage,
  Model,
  Message,
  OutMessage,
})
