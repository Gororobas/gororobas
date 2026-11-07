import type { GrammaticalGender } from "@gororobas/domain/common/enums"
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
 * A `GrammaticalGender` as the key of an ICU `select`, which is how translations agree with a name:
 * Portuguese and Spanish say "da Banana" but "do Mamão", while English ignores it.
 *
 * ICU requires every `select` to have an `other` branch, so names without a gender and `NEUTRAL`
 * ones both land there. `female` and `male` are the keys ICU's own gender examples use, which
 * translators and translation tools recognize.
 */
export type IcuGenderKey = "female" | "male" | "other"

const icuGenderKeys: Readonly<Record<GrammaticalGender, IcuGenderKey>> = {
  FEMALE: "female",
  MALE: "male",
  NEUTRAL: "other",
}

export const nameGender = (article: NamedArticle): IcuGenderKey =>
  EffectArray.head(article.commonNames).pipe(
    Option.flatMap((name) => name.grammaticalGender),
    Option.match({ onNone: () => "other", onSome: (gender) => icuGenderKeys[gender] }),
  )

/** What messages about an article interpolate: its name and the gender translations agree with. */
export const nameParts = (article: NamedArticle) => ({
  name: primaryName(article),
  gender: nameGender(article),
})
