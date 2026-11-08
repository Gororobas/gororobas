import { SupportedLanguage } from "@gororobas/domain/common/enums"
import { DateTime, Effect, Layer, Schema } from "effect"
import * as Dom from "foldkit/dom"
import { load, pushUrl, replaceUrl } from "foldkit/navigation"

import { SEARCH_FIELD_ID } from "../blocks/search"
import { LanguagePreferenceStore } from "../lib/language-preference"
import { Translations } from "../lib/translations"
import { ApplicationBlock } from "./definition"
import { Message } from "./message"

export const NavigateInternal = ApplicationBlock.makeCommand("NavigateInternal", {
  args: { url: Schema.String },
  messages: [Message.CompletedNavigateInternal],
  handler: function* () {
    return ({ url }) => pushUrl(url).pipe(Effect.as(Message.CompletedNavigateInternal()))
  },
})

/** For paths without a language: the same page, at its URL in the app's language. */
export const ReplaceUrl = ApplicationBlock.makeCommand("ReplaceUrl", {
  args: { url: Schema.String },
  messages: [Message.CompletedReplaceUrl],
  handler: function* () {
    return ({ url }) => replaceUrl(url).pipe(Effect.as(Message.CompletedReplaceUrl()))
  },
})

export const LoadTranslations = ApplicationBlock.makeCommand("LoadTranslations", {
  args: { language: SupportedLanguage, requestNumber: Schema.Int },
  messages: [Message.CompletedLoadTranslations, Message.FailedLoadTranslations],
  handler: function* () {
    const translations = yield* Translations

    return ({ language, requestNumber }) =>
      translations.load(language).pipe(
        Effect.as(Message.CompletedLoadTranslations({ language, requestNumber })),
        Effect.orElseSucceed(() => Message.FailedLoadTranslations({ language, requestNumber })),
      )
  },
})

export const SaveLanguagePreference = ApplicationBlock.makeCommand("SaveLanguagePreference", {
  args: { language: SupportedLanguage },
  messages: [Message.CompletedSaveLanguagePreference],
  handler: function* () {
    const store = yield* LanguagePreferenceStore
    return ({ language }) =>
      store.write(language).pipe(Effect.as(Message.CompletedSaveLanguagePreference()))
  },
})

export const LoadExternal = ApplicationBlock.makeCommand("LoadExternal", {
  args: { href: Schema.String },
  messages: [Message.CompletedLoadExternal],
  handler: function* () {
    return ({ href }) => load(href).pipe(Effect.as(Message.CompletedLoadExternal()))
  },
})

export const FocusSearchField = ApplicationBlock.makeCommand("FocusSearchField", {
  messages: [Message.CompletedFocusSearchField],
  handler: function* () {
    return () =>
      // The search page may have been left before it rendered.
      Dom.focus(`#${SEARCH_FIELD_ID}`).pipe(
        Effect.catchTag("ElementNotFound", () => Effect.void),
        Effect.as(Message.CompletedFocusSearchField()),
      )
  },
})

export const ReadToday = ApplicationBlock.makeCommand("ReadToday", {
  messages: [Message.CompletedReadToday],
  handler: function* () {
    return () => DateTime.now.pipe(Effect.map((today) => Message.CompletedReadToday({ today })))
  },
})

export const EffectsLayer = Layer.mergeAll(
  NavigateInternal.layer,
  LoadExternal.layer,
  ReplaceUrl.layer,
  LoadTranslations.layer,
  SaveLanguagePreference.layer,
  ReadToday.layer,
  FocusSearchField.layer,
)
