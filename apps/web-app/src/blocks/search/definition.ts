import { SupportedLanguage } from "@gororobas/domain/common/enums"
import { Schema } from "effect"
import { Block } from "foldkit"

import { GororobasApiClient } from "../../api-client"
import { RecentSearchesStore } from "../../lib/recent-searches"
import { SessionAccess } from "../../session-access"
import { InMessage } from "./in-message"
import { Message } from "./message"
import { Model } from "./model"
import type { ViewInputs } from "./view"

export const SearchKey = Symbol("Search")

export const SearchBlock = Block.make("Search", {
  key: SearchKey,
  Init: Schema.Tuple([]),
  /** Searches navigate to URLs in the language the app is read in. */
  Context: Schema.Tuple([SupportedLanguage]),
  view: { kind: "Element", Inputs: Block.makeInputContract<ViewInputs>() },
  effects: { services: [GororobasApiClient, RecentSearchesStore, SessionAccess] },
  InMessage,
  Model,
  Message,
})

export const { makeFieldsStep, makeNoopStep, makeStep } = SearchBlock
