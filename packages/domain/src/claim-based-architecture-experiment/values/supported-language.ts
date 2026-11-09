import { Option, Schema } from "effect"

import { SupportedLanguage } from "../../common/enums.js"

/** The language Gororobas is written in that a provider's tag ("pt-BR", "en") names, if any. */
export const supportedLanguageOf = (tag: string): Option.Option<SupportedLanguage> =>
  Option.liftPredicate(tag.slice(0, 2).toLowerCase(), Schema.is(SupportedLanguage))
