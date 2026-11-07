import type { SupportedLanguage } from "@gororobas/domain/common/enums"
import type { BookEdition, ExternalLink } from "@gororobas/domain/wiki/domain"
import { msg, plural } from "@lingui/core/macro"
import { Style, When } from "@pleat/core"
import { Array as EffectArray, Option, Order } from "effect"
import type { Html } from "foldkit/html"

import { languageName } from "../../../lib/language"
import { type Translator, translatorFor } from "../../../lib/translations"
import { AppText } from "../../../ui/app-text"
import * as Icons from "../../../ui/icons"
import { styledAttributes } from "../../../ui/pleat-attributes"
import { SectionCard } from "../../../ui/section-card"
import { borderWidth, space, toneColors } from "../../../ui/theme"
import type { WikiArticleViewBuilder } from "../composition"
import type { Model } from "../model"
import {
  attribution,
  definitionStyle,
  detailListStyle,
  externalLinkAttributes,
  externalLinkStyle,
  termStyle,
} from "./attribution"
import { fact, linkStyle } from "./overview/facts"
import type { Page } from "./shared"

type SectionState = Readonly<{ model: Model; language: SupportedLanguage; page: Page }>

type LanguageState = Readonly<{ language: SupportedLanguage; i18n: Translator }>

const linkListStyle = Style.make({
  display: "flex",
  flexWrap: "wrap",
  columnGap: space[4],
  rowGap: space[2],
})

const editionListStyle = Style.make({ display: "grid", rowGap: space[4] })

const editionStyle = Style.make({
  display: "grid",
  rowGap: space[2],
  paddingBlockEnd: space[4],
  borderBlockEnd: `${borderWidth.hairline} solid ${toneColors.border}`,
}).pipe(Style.when(When.lastChild, { paddingBlockEnd: 0, borderBlockEnd: "none" }))

const byLanguageName = (readerLanguage: SupportedLanguage) =>
  Order.mapInput(Order.String, (link: ExternalLink) => languageName(link.language, readerLanguage))

const wikipediaLink = (
  { link, label }: Readonly<{ link: ExternalLink; label: string }>,
  h: WikiArticleViewBuilder,
): Html =>
  h.keyed("a")(
    link.language,
    styledAttributes(
      [...externalLinkAttributes(link.url, h), h.Attribute("hreflang", link.language)],
      linkStyle,
    ),
    [Icons.link({ size: "sm" }), label],
  )

/**
 * Where to read more, in the overview: the reader's language when Wikipedia has it, or else every
 * language it has, by name.
 */
export const wikipediaFact = (
  { page, language, i18n }: LanguageState & Readonly<{ page: Page }>,
  h: WikiArticleViewBuilder,
): ReadonlyArray<Html> => {
  const links = page.externalData.wikipediaLinks
  const title = i18n._(msg`Wikipedia`)

  return Option.match(
    EffectArray.findFirst(links, (link) => link.language === language),
    {
      onSome: (link) => [
        fact(
          {
            title,
            content: wikipediaLink({ link, label: i18n._(msg`Read on Wikipedia`) }, h),
          },
          h,
        ),
      ],
      onNone: () =>
        EffectArray.match(EffectArray.sort(links, byLanguageName(language)), {
          onEmpty: () => [],
          onNonEmpty: (others) => {
            const readerLanguageName = languageName(language, language)

            return [
              fact(
                {
                  title,
                  maybeDescription: Option.some(
                    i18n._(msg`No article in ${readerLanguageName} yet`),
                  ),
                  content: h.div(
                    styledAttributes([], linkListStyle),
                    others.map((link) =>
                      wikipediaLink({ link, label: languageName(link.language, language) }, h),
                    ),
                  ),
                },
                h,
              ),
            ]
          },
        }),
    },
  )
}

const editionDetails = ({
  edition,
  language,
  i18n,
}: LanguageState & Readonly<{ edition: BookEdition }>): ReadonlyArray<
  readonly [string, string]
> => [
  ...(edition.publisher === null ? [] : [[i18n._(msg`Publisher`), edition.publisher] as const]),
  ...(edition.publicationDate === null
    ? []
    : [[i18n._(msg`Published`), edition.publicationDate] as const]),
  ...(edition.pageCount === null ? [] : [[i18n._(msg`Pages`), String(edition.pageCount)] as const]),
  ...EffectArray.match(edition.languages, {
    onEmpty: () => [],
    onNonEmpty: (languages) => [
      [
        i18n._(msg`Language`),
        languages.map((code) => languageName(code, language)).join(", "),
      ] as const,
    ],
  }),
  ...EffectArray.match(edition.isbn, {
    onEmpty: () => [],
    onNonEmpty: (isbn) => [["ISBN", isbn.join(", ")] as const],
  }),
]

/** A book's editions, in the article's main column. */
export const editions = (
  { model, language, page }: SectionState,
  h: WikiArticleViewBuilder,
): ReadonlyArray<Html> => {
  const i18n = translatorFor(language)

  return EffectArray.match(page.externalData.bookEditions, {
    onEmpty: () => [],
    onNonEmpty: (all) => [
      SectionCard.view(
        {
          title: i18n._(msg`${plural(all.length, { one: "Edition", other: "Editions" })}`),
          icon: Icons.book,
          actions: attribution({ model, language, page, section: "Editions" }, h),
          children: [
            h.div(
              styledAttributes([], editionListStyle),
              all.map((edition) =>
                h.keyed("article")(edition.externalId, styledAttributes([], editionStyle), [
                  AppText.view({ element: "h3", weight: "semibold", children: [edition.title] }, h),
                  h.dl(
                    styledAttributes([], detailListStyle),
                    editionDetails({ edition, language, i18n }).flatMap(([term, value]) => [
                      h.dt(styledAttributes([], termStyle), [term]),
                      h.dd(styledAttributes([], definitionStyle), [value]),
                    ]),
                  ),
                  h.a(
                    styledAttributes(
                      externalLinkAttributes(edition.sourceUrl, h),
                      externalLinkStyle,
                    ),
                    [i18n._(msg`See on Google Books`), Icons.arrowRight({ size: "sm" })],
                  ),
                ]),
              ),
            ),
          ],
        },
        h,
      ),
    ],
  })
}
