import { SupportedLanguage } from "@gororobas/domain/common/enums"
import { type I18n, type Messages, setupI18n } from "@lingui/core"
import { Context, Effect, Layer, MutableHashMap, Option, Schema } from "effect"

import { intlTags } from "./language"

/** What views may do with a language's messages: translate them, never switch or reload. */
export type Translator = Readonly<Pick<I18n, "_">>

/** Each catalog is its own chunk, so people only download the language they read. */
const catalogs: Readonly<Record<SupportedLanguage, () => Promise<{ messages: Messages }>>> = {
  en: () => import("../locales/en/messages.po"),
  pt: () => import("../locales/pt/messages.po"),
  es: () => import("../locales/es/messages.po"),
}

/**
 * One fixed-language Lingui instance per language: nothing ever activates a shared global one.
 * Like the module registry the catalogs load through, this only grows with immutable catalogs, so it
 * isn't application state for the Model. `import()` already shares concurrent loads.
 */
const translators = MutableHashMap.empty<SupportedLanguage, Translator>()

const loadCatalog = async (language: SupportedLanguage): Promise<void> => {
  if (MutableHashMap.has(translators, language)) return

  const { messages } = await catalogs[language]()

  MutableHashMap.set(
    translators,
    language,
    setupI18n({
      locale: language,
      locales: intlTags[language],
      messages: { [language]: messages },
    }),
  )
}

export class TranslationsNotLoadedError extends Schema.TaggedError<TranslationsNotLoadedError>()(
  "TranslationsNotLoadedError",
  { language: SupportedLanguage },
) {}

/**
 * The language's translator. Views only render a language once its catalog has loaded, which the
 * root Model records, so a missing translator is a programming error rather than a state to show.
 */
export const translatorFor = (language: SupportedLanguage): Translator =>
  Option.getOrThrowWith(
    MutableHashMap.get(translators, language),
    () => new TranslationsNotLoadedError({ language }),
  )

export class TranslationsLoadError extends Schema.TaggedError<TranslationsLoadError>()(
  "TranslationsLoadError",
  { language: SupportedLanguage },
) {}

export class Translations extends Context.Service<
  Translations,
  Readonly<{ load: (language: SupportedLanguage) => Effect.Effect<void, TranslationsLoadError> }>
>()("Translations") {}

export const loadTranslations = (language: SupportedLanguage) =>
  Effect.tryPromise({
    try: () => loadCatalog(language),
    catch: () => new TranslationsLoadError({ language }),
  })

export const TranslationsLive = Layer.succeed(
  Translations,
  Translations.of({ load: loadTranslations }),
)
