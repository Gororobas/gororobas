import type { WikiArticleCommonName } from "@gororobas/domain/wiki/wiki-article-common-name"
import { Array as EffectArray, Option } from "effect"

type NamedArticle = Readonly<{ commonNames: ReadonlyArray<WikiArticleCommonName>; handle: string }>

/** The name an article goes by: its first common name, or its handle when it has none. */
export const primaryName = (article: NamedArticle): string =>
  Option.match(EffectArray.head(article.commonNames), {
    onNone: () => article.handle,
    onSome: (name) => name.name,
  })

/**
 * The name's grammatical gender, as an ICU `select` key. English copy ignores it; Portuguese and
 * Spanish translations agree with it, as in "da Banana" and "do Mamão".
 */
export type NameGender = "female" | "male" | "other"

const genders = { FEMALE: "female", MALE: "male", NEUTRAL: "other" } as const

export const nameGender = (article: NamedArticle): NameGender =>
  EffectArray.head(article.commonNames).pipe(
    Option.flatMap((name) => name.grammaticalGender),
    Option.match({ onNone: () => "other", onSome: (gender) => genders[gender] }),
  )

/** What messages about an article interpolate: its name and the gender translations agree with. */
export const nameParts = (article: NamedArticle) => ({
  name: primaryName(article),
  gender: nameGender(article),
})
