import type { WikiArticleCommonName } from "@gororobas/domain/wiki/wiki-article-common-name"
import { Array as EffectArray, Option } from "effect"

/** The name an article goes by: its first common name, or its handle when it has none. */
export const primaryName = (
  article: Readonly<{ commonNames: ReadonlyArray<WikiArticleCommonName>; handle: string }>,
): string =>
  Option.match(EffectArray.head(article.commonNames), {
    onNone: () => article.handle,
    onSome: (name) => name.name,
  })

const definiteArticles = { FEMALE: "a", MALE: "o", NEUTRAL: undefined } as const

type NamedArticle = Readonly<{ commonNames: ReadonlyArray<WikiArticleCommonName>; handle: string }>

const definiteArticle = (article: NamedArticle): Option.Option<"o" | "a"> =>
  EffectArray.head(article.commonNames).pipe(
    Option.flatMap((name) => name.grammaticalGender),
    Option.flatMap((gender) => Option.fromNullishOr(definiteArticles[gender])),
  )

/** "sobre o Mamão", or "sobre Mamão" when the name's gender is unknown. */
export const aboutName = (article: NamedArticle): string =>
  Option.match(definiteArticle(article), {
    onNone: () => primaryName(article),
    onSome: (definite) => `${definite} ${primaryName(article)}`,
  })

/** "do Mamão", "da Banana", or "de Mamão" when the name's gender is unknown. */
export const ofName = (article: NamedArticle): string =>
  Option.match(definiteArticle(article), {
    onNone: () => `de ${primaryName(article)}`,
    onSome: (definite) => `d${definite} ${primaryName(article)}`,
  })

/** Picks the word agreeing with the name's gender: "Também conhecida como" for Banana. */
export const agreeingWith = (
  article: NamedArticle,
  words: Readonly<{ feminine: string; otherwise: string }>,
): string => (Option.contains(definiteArticle(article), "a") ? words.feminine : words.otherwise)
