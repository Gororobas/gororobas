import { SupportedLanguage } from "@gororobas/domain/common/enums"
import { Schema } from "effect"
import { Block } from "foldkit"
import { Url } from "foldkit/url"

import { GororobasApiClient } from "../api-client"
import { LanguagePreferenceStore } from "../lib/language-preference"
import { RecentSearchesStore } from "../lib/recent-searches"
import { Translations } from "../lib/translations"
import { AuthenticationClient, SessionAccess } from "../session-access"
import { Message } from "./message"
import { Model } from "./model"

/**
 * The language the app boots in, whose translations have already loaded. When the one people asked
 * for failed to load, the app boots in the default language and says so.
 */
export const Flags = Schema.Struct({
  language: SupportedLanguage,
  maybeUnavailableLanguage: Schema.Option(SupportedLanguage),
})

export const ApplicationKey = Symbol("Application")

export const ApplicationBlock = Block.make("Application", {
  key: ApplicationKey,
  InitArgs: Schema.Tuple([Flags, Url]),
  view: { kind: "Document" },
  /** What the pages' effects need, provided by `ApplicationLayer`. */
  effects: {
    services: [
      AuthenticationClient,
      GororobasApiClient,
      LanguagePreferenceStore,
      RecentSearchesStore,
      SessionAccess,
      Translations,
    ],
  },
  Model,
  Message,
})

export const { makeCommandsStep, makeFieldsStep, makeNoopStep, makeStep } = ApplicationBlock
