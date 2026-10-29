import { SupportedLanguage } from "./enums.js"

/**
 * Which languages to read, in order, when content isn't available in the requested one: the
 * requested language first, then the others in `SupportedLanguage`'s order (Portuguese, Spanish,
 * English). SQL readers sort by the same order through `orderByLanguagePreference`.
 */
export const languageFallbackOrder = (
  requested: SupportedLanguage,
): ReadonlyArray<SupportedLanguage> => [
  requested,
  ...SupportedLanguage.literals.filter((language) => language !== requested),
]

/** The first language in `languageFallbackOrder(requested)` that `isAvailable` accepts. */
export const preferredLanguage = (
  requested: SupportedLanguage,
  isAvailable: (language: SupportedLanguage) => boolean,
): SupportedLanguage | undefined => languageFallbackOrder(requested).find(isAvailable)
