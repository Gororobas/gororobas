import { Schema } from "effect"
import { Block } from "foldkit"
import { Url } from "foldkit/url"

import { GororobasApiClient } from "../api-client"
import { RecentSearchesStore } from "../lib/recent-searches"
import { AuthenticationClient, SessionAccess } from "../session-access"
import { Message } from "./message"
import { Model } from "./model"

export const ApplicationKey = Symbol("Application")

export const ApplicationBlock = Block.make("Application", {
  key: ApplicationKey,
  Init: Schema.Tuple([Url]),
  view: { kind: "Document" },
  /** What the pages' effects need, provided by `ApplicationLayer`. */
  effects: {
    services: [AuthenticationClient, GororobasApiClient, RecentSearchesStore, SessionAccess],
  },
  Model,
  Message,
})

export const { makeCommandsStep, makeFieldsStep, makeNoopStep, makeStep } = ApplicationBlock
