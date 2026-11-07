import { SupportedLanguage } from "@gororobas/domain/common/enums"
import { type I18n, type MessageDescriptor, type Messages, setupI18n } from "@lingui/core"
import { Context, Effect, Layer, MutableHashMap, Option, Record, Schema } from "effect"

import { messages as defaultMessages } from "../locales/en/messages.po"
import { DEFAULT_LANGUAGE, intlTags } from "./language"

/** What views may do with a language's messages: translate them, never switch or reload. */
export type Translator = Readonly<Pick<I18n, "_">>

/**
 * The default language's catalog ships in the main bundle, so the app can always render: it's what
 * people read while another language fails to load. Typed by `DEFAULT_LANGUAGE`, so reordering
 * `SupportedLanguage` fails here until this import follows.
 */
const bundledCatalog: Readonly<Record<typeof DEFAULT_LANGUAGE, Messages>> = {
  en: defaultMessages,
}

/** Every other catalog is its own chunk, so people only download the language they read. */
const lazyCatalogs: Readonly<
  Record<Exclude<SupportedLanguage, typeof DEFAULT_LANGUAGE>, () => Promise<{ messages: Messages }>>
> = {
  pt: () => import("../locales/pt/messages.po"),
  es: () => import("../locales/es/messages.po"),
}

const makeTranslator = (language: SupportedLanguage, messages: Messages): Translator =>
  setupI18n({ locale: language, locales: intlTags[language], messages: { [language]: messages } })

/**
 * One fixed-language Lingui instance per language: nothing ever activates a shared global one.
 * Like the module registry the catalogs load through, this only grows with immutable catalogs, so it
 * isn't application state for the Model. `import()` already shares concurrent loads.
 */
const translators = MutableHashMap.fromIterable<SupportedLanguage, Translator>([
  [DEFAULT_LANGUAGE, makeTranslator(DEFAULT_LANGUAGE, bundledCatalog[DEFAULT_LANGUAGE])],
])

// A catalog edit replaces this module and empties the registry under a running app, whose Model
// may name a language that then has no translator. Booting afresh reloads every catalog.
if (import.meta.hot) {
  import.meta.hot.dispose(() => window.location.reload())
}

const loadCatalog = async (language: SupportedLanguage): Promise<void> => {
  if (MutableHashMap.has(translators, language) || language === DEFAULT_LANGUAGE) return

  const { messages } = await lazyCatalogs[language]()
  MutableHashMap.set(translators, language, makeTranslator(language, messages))
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
  { language: SupportedLanguage, reason: Schema.String },
) {}

export class Translations extends Context.Service<
  Translations,
  Readonly<{ load: (language: SupportedLanguage) => Effect.Effect<void, TranslationsLoadError> }>
>()("Translations") {}

/**
 * Loads a language's catalog. A failure is logged as a warning in the `LoadTranslations` span, for
 * whatever exports the app's logs, and left to callers to fall back from.
 */
export const loadTranslations = (language: SupportedLanguage) =>
  Effect.tryPromise({
    try: () => loadCatalog(language),
    catch: (cause) => new TranslationsLoadError({ language, reason: String(cause) }),
  }).pipe(
    Effect.tapError((error) =>
      Effect.logWarning("Translations failed to load").pipe(
        Effect.annotateLogs({ language, reason: error.reason }),
      ),
    ),
    Effect.withSpan("LoadTranslations", { attributes: { language } }),
  )

export const TranslationsLive = Layer.succeed(
  Translations,
  Translations.of({ load: loadTranslations }),
)

/** A record of labels in the translator's language, for helpers that render plain strings. */
export const translateLabels = <Key extends string>(
  i18n: Translator,
  labels: Readonly<Record<Key, MessageDescriptor>>,
): Readonly<Record<Key, string>> => Record.map(labels, (label) => i18n._(label))
