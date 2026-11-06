import { SupportedLanguage } from "@gororobas/domain/common/enums"
import { Array as EffectArray, Option, Schema, String as EffectString, pipe } from "effect"

/**
 * The language people read the app in: its interface copy, its URLs and the content it asks for.
 * There is no geographic localization, so this is a `SupportedLanguage`, never a locale.
 */
export type LanguageInputs = Readonly<{ language: SupportedLanguage }>

/** Regional tags for Intl and `<html lang>`, following the audience each language serves. */
export const intlTags = {
  pt: "pt-BR",
  es: "es-419",
  en: "en-US",
} as const satisfies Readonly<Record<SupportedLanguage, string>>

/** Each language in its own name, which is how people look for theirs in a switcher. */
export const languageNames = {
  pt: "Português",
  es: "Español",
  en: "English",
} as const satisfies Readonly<Record<SupportedLanguage, string>>

export const DEFAULT_LANGUAGE: SupportedLanguage = "pt"

/** `pt-BR` and `pt` both read as Portuguese; unsupported tags read as absent. */
export const languageOfTag = (tag: string): Option.Option<SupportedLanguage> =>
  pipe(
    EffectString.toLowerCase(EffectString.trim(tag)).split("-")[0] ?? "",
    Option.liftPredicate(Schema.is(SupportedLanguage)),
  )

/** For paths without a language: the person's saved choice, then their browser's, then Portuguese. */
export const detectLanguage = (
  maybePreference: Option.Option<SupportedLanguage>,
  browserLanguageTags: ReadonlyArray<string>,
): SupportedLanguage =>
  Option.getOrElse(
    Option.orElse(maybePreference, () => EffectArray.findFirst(browserLanguageTags, languageOfTag)),
    () => DEFAULT_LANGUAGE,
  )
