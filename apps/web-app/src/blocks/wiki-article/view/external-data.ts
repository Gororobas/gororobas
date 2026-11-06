import type { BookEdition, ExternalLink } from "@gororobas/domain/wiki/domain"
import { Style, When } from "@pleat/core"
import { Array as EffectArray, Option, Order, String as EffectString } from "effect"
import type { Html } from "foldkit/html"

import { readerLanguage } from "../../../lib/reader-language"
import { AppText } from "../../../ui/app-text"
import * as Icons from "../../../ui/icons"
import { styledAttributes } from "../../../ui/pleat-attributes"
import { SectionCard } from "../../../ui/section-card"
import { focusRingDeclarations } from "../../../ui/styles/focus-ring"
import { borderWidth, fontWeight, radius, space, toneColors, tones } from "../../../ui/theme"
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
import { fact } from "./overview/facts"
import type { Page } from "./shared"

type SectionState = Readonly<{ model: Model; page: Page }>

const linkListStyle = Style.make({ display: "flex", flexWrap: "wrap", gap: space[2] })

const languageLinkStyle = Style.make({
  display: "inline-flex",
  alignItems: "center",
  gap: space[2],
  paddingBlock: space[2],
  paddingInline: space[3],
  borderRadius: radius.full,
  cornerShape: "squircle",
  backgroundColor: tones.primary.ramp[400],
  color: tones.neutral.ramp[900],
  fontWeight: fontWeight.medium,
  outline: "none",
}).pipe(
  Style.when(When.hover, { filter: "brightness(0.96)" }),
  Style.when(When.focusVisible, focusRingDeclarations),
)

const editionListStyle = Style.make({ display: "grid", rowGap: space[4] })

const editionStyle = Style.make({
  display: "grid",
  rowGap: space[2],
  paddingBlockEnd: space[4],
  borderBlockEnd: `${borderWidth.hairline} solid ${toneColors.border}`,
}).pipe(Style.when(When.lastChild, { paddingBlockEnd: 0, borderBlockEnd: "none" }))

const languageNames = new Intl.DisplayNames(["pt-BR"], { type: "language" })

const languageName = (code: string): string =>
  EffectString.capitalize(
    Option.getOrElse(Option.fromNullishOr(languageNames.of(code)), () => code),
  )

const byLanguageName = Order.mapInput(Order.String, (link: ExternalLink) =>
  languageName(link.language),
)

const wikipediaLink = (
  { link, label }: Readonly<{ link: ExternalLink; label: string }>,
  h: WikiArticleViewBuilder,
): Html =>
  h.keyed("a")(
    link.language,
    styledAttributes(
      [...externalLinkAttributes(link.url, h), h.Attribute("hreflang", link.language)],
      languageLinkStyle,
    ),
    [label, Icons.arrowRight({ size: "sm" })],
  )

/**
 * Where to read more, in the overview: the reader's language when Wikipedia has it, or else every
 * language it has, by name.
 */
export const wikipediaFact = (page: Page, h: WikiArticleViewBuilder): ReadonlyArray<Html> => {
  const links = page.externalData.wikipediaLinks

  return Option.match(
    EffectArray.findFirst(links, (link) => link.language === readerLanguage),
    {
      onSome: (link) => [
        fact(
          { title: "Wikipédia", content: wikipediaLink({ link, label: "Ler na Wikipédia" }, h) },
          h,
        ),
      ],
      onNone: () =>
        EffectArray.match(EffectArray.sort(links, byLanguageName), {
          onEmpty: () => [],
          onNonEmpty: (others) => [
            fact(
              {
                title: "Wikipédia",
                maybeDescription: Option.some(
                  `Ainda sem artigo em ${languageName(readerLanguage)}`,
                ),
                content: h.div(
                  styledAttributes([], linkListStyle),
                  others.map((link) =>
                    wikipediaLink({ link, label: languageName(link.language) }, h),
                  ),
                ),
              },
              h,
            ),
          ],
        }),
    },
  )
}

const editionDetails = (edition: BookEdition): ReadonlyArray<readonly [string, string]> => [
  ...(edition.publisher === null ? [] : [["Editora", edition.publisher] as const]),
  ...(edition.publicationDate === null ? [] : [["Publicação", edition.publicationDate] as const]),
  ...(edition.pageCount === null ? [] : [["Páginas", String(edition.pageCount)] as const]),
  ...EffectArray.match(edition.languages, {
    onEmpty: () => [],
    onNonEmpty: (languages) => [["Idioma", languages.map(languageName).join(", ")] as const],
  }),
  ...EffectArray.match(edition.isbn, {
    onEmpty: () => [],
    onNonEmpty: (isbn) => [["ISBN", isbn.join(", ")] as const],
  }),
]

/** A book's editions, in the article's main column. */
export const editions = (
  { model, page }: SectionState,
  h: WikiArticleViewBuilder,
): ReadonlyArray<Html> =>
  EffectArray.match(page.externalData.bookEditions, {
    onEmpty: () => [],
    onNonEmpty: (all) => [
      SectionCard.view(
        {
          title: all.length === 1 ? "Edição" : "Edições",
          icon: Icons.book,
          actions: attribution({ model, page, section: "Editions" }, h),
          children: [
            h.div(
              styledAttributes([], editionListStyle),
              all.map((edition) =>
                h.keyed("article")(edition.externalId, styledAttributes([], editionStyle), [
                  AppText.view({ element: "h3", weight: "semibold", children: [edition.title] }, h),
                  h.dl(
                    styledAttributes([], detailListStyle),
                    editionDetails(edition).flatMap(([term, value]) => [
                      h.dt(styledAttributes([], termStyle), [term]),
                      h.dd(styledAttributes([], definitionStyle), [value]),
                    ]),
                  ),
                  h.a(
                    styledAttributes(
                      externalLinkAttributes(edition.sourceUrl, h),
                      externalLinkStyle,
                    ),
                    ["Ver no Google Livros", Icons.arrowRight({ size: "sm" })],
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
