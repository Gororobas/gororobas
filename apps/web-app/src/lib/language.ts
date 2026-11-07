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

/** The first `SupportedLanguage`, for people whose saved choice and browser name none. */
export const DEFAULT_LANGUAGE = SupportedLanguage.literals[0]

/** `pt-BR` and `pt` both read as Portuguese; unsupported tags read as absent. */
export const languageOfTag = (tag: string): Option.Option<SupportedLanguage> =>
  pipe(
    EffectString.toLowerCase(EffectString.trim(tag)).split("-")[0] ?? "",
    Option.liftPredicate(Schema.is(SupportedLanguage)),
  )

/** For paths without a language: the person's saved choice, then their browser's, then the default. */
export const detectLanguage = (
  maybePreference: Option.Option<SupportedLanguage>,
  browserLanguageTags: ReadonlyArray<string>,
): SupportedLanguage =>
  Option.getOrElse(
    Option.orElse(maybePreference, () => EffectArray.findFirst(browserLanguageTags, languageOfTag)),
    () => DEFAULT_LANGUAGE,
  )

/**
 * A language's name in the reader's language, as written mid-sentence: "inglês" for `en` in
 * Portuguese, but "English" in English.
 */
export const inlineLanguageName = (code: string, readerLanguage: SupportedLanguage): string =>
  Option.getOrElse(
    Option.fromNullishOr(
      new Intl.DisplayNames([intlTags[readerLanguage]], { type: "language" }).of(code),
    ),
    () => code,
  )

/** A language's name in the reader's language on its own, such as "Inglês" in a list. */
export const languageName = (code: string, readerLanguage: SupportedLanguage): string =>
  EffectString.capitalize(inlineLanguageName(code, readerLanguage))
