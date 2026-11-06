import * as BrowserKeyValueStore from "@effect/platform-browser/BrowserKeyValueStore"
import { SupportedLanguage } from "@gororobas/domain/common/enums"
import { Context, Effect, Layer, Option } from "effect"
import * as KeyValueStore from "effect/persistence/KeyValueStore"

/**
 * The language someone last read the app in, for paths that don't say which. Kept in localStorage
 * rather than a cookie: it must survive offline and in Capacitor's WebView, and no server reads it.
 */
export class LanguagePreferenceStore extends Context.Service<
  LanguagePreferenceStore,
  Readonly<{
    read: Effect.Effect<Option.Option<SupportedLanguage>>
    write: (language: SupportedLanguage) => Effect.Effect<void>
  }>
>()("LanguagePreferenceStore") {}

const STORAGE_KEY = "gororobas-language"

/** Unreadable or unwritable storage means no preference. */
export const LanguagePreferenceStoreLive = Layer.effect(
  LanguagePreferenceStore,
  Effect.gen(function* () {
    const store = KeyValueStore.toSchemaStore(yield* KeyValueStore.KeyValueStore, SupportedLanguage)

    return LanguagePreferenceStore.of({
      read: store.get(STORAGE_KEY).pipe(Effect.orElseSucceed(() => Option.none())),
      write: (language) => store.set(STORAGE_KEY, language).pipe(Effect.ignore),
    })
  }),
).pipe(Layer.provide(BrowserKeyValueStore.layerLocalStorage))
