import type {
  BookEdition,
  ExternalDataAttribution,
  WikiArticleExternalData,
} from "@gororobas/domain/wiki/domain"
import { Style, When } from "@pleat/core"
import { Array as EffectArray, DateTime, Option, Order, String as EffectString } from "effect"
import { AsyncData } from "foldkit"
import type { Html } from "foldkit/html"

import { aboutName, ofName } from "../../../lib/wiki-article-names"
import { popoverBackdropStyle, popoverPanelStyle } from "../../../ui/app-popover/styles"
import { AppText } from "../../../ui/app-text"
import * as Icons from "../../../ui/icons"
import { styledAttributes } from "../../../ui/pleat-attributes"
import { ProviderMark } from "../../../ui/provider-mark"
import { SectionCard, cardBleedStyle } from "../../../ui/section-card"
import { focusRingDeclarations } from "../../../ui/styles/focus-ring"
import {
  borderWidth,
  controlSize,
  duration,
  fontSize,
  fontWeight,
  radius,
  space,
  toneColors,
  tones,
  toneStyle,
} from "../../../ui/theme"
import {
  AttributionPopoversBinding,
  attributionPopoverId,
  type WikiArticleViewBuilder,
} from "../composition"
import { type ExternalDataSection, type Model, externalDataSectionProviders } from "../model"
import type { Page } from "./shared"

const MEDIA_PREVIEW_COUNT = 12

// STYLES

const attributionTriggerStyle = Style.make({
  display: "inline-flex",
  alignItems: "center",
  gap: space[2],
  blockSize: controlSize.sm,
  paddingInline: space[3],
  border: `${borderWidth.hairline} solid ${toneColors.border}`,
  borderRadius: radius.full,
  cornerShape: "squircle",
  backgroundColor: toneColors.backgroundCard,
  color: tones.neutral.shade[700],
  fontSize: fontSize.caption,
  fontWeight: fontWeight.semibold,
  whiteSpace: "nowrap",
  cursor: "pointer",
  outline: "none",
  transitionProperty: "background-color",
  transitionDuration: duration.control,
}).pipe(
  Style.when(When.hover, { backgroundColor: toneColors.hover }),
  Style.when(When.focusVisible, focusRingDeclarations),
)

const attributionPanelStyle = Style.make({ inlineSize: "min(20rem, calc(100vw - 2rem))" })

const attributionHeaderStyle = Style.make({
  display: "flex",
  alignItems: "center",
  gap: space[2],
  fontSize: fontSize.large,
})

const externalLinkStyle = Style.make({
  display: "inline-flex",
  alignItems: "center",
  gap: space[1],
  color: tones.accent.shade[800],
  fontWeight: fontWeight.semibold,
  textDecorationLine: "underline",
  textDecorationColor: tones.accent.shade[300],
  textUnderlineOffset: "0.2em",
  borderRadius: radius.sm,
  outline: "none",
}).pipe(
  Style.when(When.hover, { textDecorationColor: tones.accent.shade[700] }),
  Style.when(When.focusVisible, focusRingDeclarations),
)

const detailListStyle = Style.make({
  display: "grid",
  gridTemplateColumns: "max-content 1fr",
  columnGap: space[4],
  rowGap: space[2],
  margin: 0,
})

const termStyle = Style.make({ color: tones.neutral.shade[700] })
const definitionStyle = Style.make({ margin: 0 })
const scientificNameStyle = Style.make({ fontStyle: "italic" })

const mediaStripStyle = Style.make({
  display: "flex",
  gap: space[3],
  overflowX: "auto",
  scrollSnapType: "x mandatory",
  paddingBlockEnd: space[1],
})

const mediaFigureStyle = Style.make({
  display: "grid",
  rowGap: space[1],
  flex: "0 0 auto",
  inlineSize: "11rem",
  margin: 0,
  scrollSnapAlign: "start",
})

const mediaLinkStyle = Style.make({
  display: "block",
  borderRadius: radius.md,
  overflow: "hidden",
  outline: "none",
}).pipe(Style.when(When.focusVisible, focusRingDeclarations))

const mediaImageStyle = Style.make({
  display: "block",
  inlineSize: "100%",
  aspectRatio: "4 / 3",
  objectFit: "cover",
  backgroundColor: tones.neutral.shade[100],
})

const creditStyle = Style.make({
  display: "-webkit-box",
  WebkitLineClamp: 2,
  WebkitBoxOrient: "vertical",
  overflow: "hidden",
  color: tones.neutral.shade[700],
})

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

// VOCABULARY

const providerDescriptions: Readonly<Record<ExternalDataAttribution["provider"], string>> = {
  WIKIDATA:
    "Base de conhecimento livre e colaborativa da Wikimedia. Seus dados estão em domínio público (CC0).",
  GBIF: "Global Biodiversity Information Facility, rede aberta de dados sobre biodiversidade. A classificação segue o Catálogo da Vida, e cada foto mantém sua própria licença e autoria.",
  GOOGLE_BOOKS: "Informações das edições publicadas, segundo o catálogo do Google Livros.",
}

/** Ranks from broadest to narrowest; GBIF reports them in upper case. */
const rankLabels: ReadonlyArray<readonly [string, string]> = [
  ["KINGDOM", "Reino"],
  ["PHYLUM", "Filo"],
  ["CLASS", "Classe"],
  ["ORDER", "Ordem"],
  ["FAMILY", "Família"],
  ["GENUS", "Gênero"],
  ["SPECIES", "Espécie"],
]

/** Genus and below are written in italics, as botanical names are. */
const italicRanks: ReadonlyArray<string> = ["GENUS", "SPECIES", "SUBSPECIES", "VARIETY"]

const languageNames = new Intl.DisplayNames(["pt-BR"], { type: "language" })

const languageName = (code: string): string =>
  EffectString.capitalize(
    Option.getOrElse(Option.fromNullishOr(languageNames.of(code)), () => code),
  )

const formatDate = (date: DateTime.Utc): string =>
  new Intl.DateTimeFormat("pt-BR", { dateStyle: "long", timeZone: "UTC" }).format(
    DateTime.toDate(date),
  )

const externalLinkAttributes = (href: string, h: WikiArticleViewBuilder) => [
  h.Href(href),
  h.Attribute("target", "_blank"),
  h.Attribute("rel", "noopener noreferrer"),
]

// ATTRIBUTION

/** Credits a section's provider: its mark opens what it is, when it was read and where to check. */
const attribution = (
  {
    model,
    data,
    section,
  }: Readonly<{ model: Model; data: WikiArticleExternalData; section: ExternalDataSection }>,
  h: WikiArticleViewBuilder,
): ReadonlyArray<Html> => {
  const provider = externalDataSectionProviders[section]
  const maybeCredit = EffectArray.findFirst(
    data.attributions,
    (credit) => credit.provider === provider,
  )
  const maybePopover = EffectArray.findFirst(
    model.attributionPopovers,
    (popover) => popover.id === attributionPopoverId(section),
  )
  const name = ProviderMark.names[provider]

  return EffectArray.fromOption(
    Option.map(Option.all({ credit: maybeCredit, popover: maybePopover }), ({ credit, popover }) =>
      h.block(
        AttributionPopoversBinding.embedView({
          key: popover.id,
          slotId: popover.id,
          model: popover,
          viewInputs: {
            anchor: { placement: "bottom-end", gap: 6, padding: 8 },
            ariaLabel: `Fonte: ${name}`,
            toView: ({ button, panel, backdrop, isVisible }) =>
              h.div(
                [],
                [
                  h.button(
                    styledAttributes(
                      [h.Type("button"), h.Title(`Dados do ${name}`), ...button],
                      attributionTriggerStyle,
                    ),
                    [
                      ProviderMark.view(provider),
                      ...(ProviderMark.isWordmark[provider] ? [] : [name]),
                    ],
                  ),
                  ...(isVisible
                    ? [
                        h.div(styledAttributes(backdrop, popoverBackdropStyle)),
                        h.div(
                          styledAttributes(
                            panel,
                            popoverPanelStyle,
                            attributionPanelStyle,
                            toneStyle("primary"),
                          ),
                          [
                            h.div(styledAttributes([], attributionHeaderStyle), [
                              ProviderMark.view(provider),
                              AppText.view(
                                {
                                  element: "p",
                                  weight: "semibold",
                                  children: [`Dados do ${name}`],
                                },
                                h,
                              ),
                            ]),
                            AppText.view(
                              {
                                element: "p",
                                appearance: "footnote",
                                lineHeight: "relaxed",
                                children: [providerDescriptions[provider]],
                              },
                              h,
                            ),
                            h.dl(styledAttributes([], detailListStyle), [
                              h.dt(styledAttributes([], termStyle), ["Identificador"]),
                              h.dd(styledAttributes([], definitionStyle), [credit.externalId]),
                              h.dt(styledAttributes([], termStyle), ["Atualizado em"]),
                              h.dd(styledAttributes([], definitionStyle), [
                                formatDate(credit.observedAt),
                              ]),
                            ]),
                            h.a(
                              styledAttributes(
                                externalLinkAttributes(credit.url, h),
                                externalLinkStyle,
                              ),
                              [`Ver no ${name}`, Icons.arrowRight({ size: "sm" })],
                            ),
                          ],
                        ),
                      ]
                    : []),
                ],
              ),
          },
        }),
      ),
    ),
  )
}

// SECTIONS

type SectionState = Readonly<{ model: Model; page: Page; data: WikiArticleExternalData }>

const rankOrder = (rank: string) => {
  const index = rankLabels.findIndex(([known]) => known === rank)
  return index === -1 ? rankLabels.length : index
}

const taxonomy = ({ model, data }: SectionState, h: WikiArticleViewBuilder): ReadonlyArray<Html> =>
  EffectArray.fromOption(
    Option.filter(
      Option.fromNullishOr(data.taxonomy),
      (taxonomy) =>
        EffectArray.isReadonlyArrayNonEmpty(taxonomy.classification) ||
        taxonomy.taxonomyGroup !== null,
    ),
  ).map((taxonomy) =>
    SectionCard.view(
      {
        title: "Classificação",
        icon: Icons.layers,
        actions: attribution({ model, data, section: "Taxonomy" }, h),
        children: [
          h.dl(styledAttributes([], detailListStyle), [
            ...EffectArray.sort(
              taxonomy.classification,
              Order.mapInput(Order.Number, (entry: (typeof taxonomy.classification)[number]) =>
                rankOrder(entry.taxonRank),
              ),
            ).flatMap((entry) => [
              h.dt(styledAttributes([], termStyle), [
                Option.getOrElse(
                  Option.map(
                    EffectArray.findFirst(rankLabels, ([rank]) => rank === entry.taxonRank),
                    ([, label]) => label,
                  ),
                  () => EffectString.capitalize(EffectString.toLowerCase(entry.taxonRank)),
                ),
              ]),
              h.dd(
                styledAttributes(
                  [],
                  definitionStyle,
                  ...(italicRanks.includes(entry.taxonRank) ? [scientificNameStyle] : []),
                ),
                [entry.scientificName],
              ),
            ]),
            ...(taxonomy.taxonomyGroup === null
              ? []
              : [
                  h.dt(styledAttributes([], termStyle), ["Grupo"]),
                  h.dd(styledAttributes([], definitionStyle), [taxonomy.taxonomyGroup]),
                ]),
          ]),
        ],
      },
      h,
    ),
  )

/** Photos people recorded in the wild, each crediting its author and leading to its record. */
const media = (
  { model, page, data }: SectionState,
  h: WikiArticleViewBuilder,
): ReadonlyArray<Html> =>
  EffectArray.match(data.media.slice(0, MEDIA_PREVIEW_COUNT), {
    onEmpty: () => [],
    onNonEmpty: (shown) => [
      SectionCard.view(
        {
          title: "Registros na natureza",
          icon: Icons.gallery,
          actions: attribution({ model, data, section: "Media" }, h),
          children: [
            AppText.view(
              {
                element: "p",
                appearance: "footnote",
                isMuted: true,
                children: [`Fotos ${ofName(page)} registradas por pessoas ao redor do mundo.`],
              },
              h,
            ),
            h.div(
              styledAttributes([], mediaStripStyle, cardBleedStyle),
              shown.map((item) =>
                h.keyed("figure")(item.mediaUrl, styledAttributes([], mediaFigureStyle), [
                  h.a(
                    styledAttributes(
                      [
                        ...externalLinkAttributes(item.sourceUrl, h),
                        h.AriaLabel(`Registro: ${item.creditLine}`),
                      ],
                      mediaLinkStyle,
                    ),
                    [
                      h.img(
                        styledAttributes(
                          [
                            h.Src(item.mediaUrl),
                            h.Alt(""),
                            h.Attribute("loading", "lazy"),
                            h.Attribute("decoding", "async"),
                          ],
                          mediaImageStyle,
                        ),
                      ),
                    ],
                  ),
                  h.figcaption(
                    [],
                    [
                      AppText.view(
                        {
                          element: "span",
                          appearance: "caption",
                          styles: [creditStyle],
                          children: [
                            item.creditLine,
                            ...(item.licenseUrl === null
                              ? []
                              : [
                                  " · ",
                                  h.a(
                                    styledAttributes(
                                      externalLinkAttributes(item.licenseUrl, h),
                                      externalLinkStyle,
                                    ),
                                    ["licença"],
                                  ),
                                ]),
                          ],
                        },
                        h,
                      ),
                    ],
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

/** Portuguese first, then other languages alphabetically by their name. */
const wikipediaOrder = Order.combine(
  Order.mapInput(
    Order.Boolean,
    (link: WikiArticleExternalData["wikipediaLinks"][number]) => link.language !== "pt",
  ),
  Order.mapInput(Order.String, (link: WikiArticleExternalData["wikipediaLinks"][number]) =>
    languageName(link.language),
  ),
)

const wikipedia = (
  { model, page, data }: SectionState,
  h: WikiArticleViewBuilder,
): ReadonlyArray<Html> =>
  EffectArray.match(EffectArray.sort(data.wikipediaLinks, wikipediaOrder), {
    onEmpty: () => [],
    onNonEmpty: (links) => [
      SectionCard.view(
        {
          title: "Na Wikipédia",
          icon: Icons.globe,
          actions: attribution({ model, data, section: "Wikipedia" }, h),
          children: [
            AppText.view(
              {
                element: "p",
                appearance: "footnote",
                isMuted: true,
                children: [`Leia mais sobre ${aboutName(page)} na enciclopédia livre.`],
              },
              h,
            ),
            h.div(
              styledAttributes([], linkListStyle),
              links.map((link) =>
                h.keyed("a")(
                  link.language,
                  styledAttributes(
                    [
                      ...externalLinkAttributes(link.url, h),
                      h.Attribute("hreflang", link.language),
                    ],
                    languageLinkStyle,
                  ),
                  [languageName(link.language), Icons.arrowRight({ size: "sm" })],
                ),
              ),
            ),
          ],
        },
        h,
      ),
    ],
  })

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

const editions = ({ model, data }: SectionState, h: WikiArticleViewBuilder): ReadonlyArray<Html> =>
  EffectArray.match(data.bookEditions, {
    onEmpty: () => [],
    onNonEmpty: (all) => [
      SectionCard.view(
        {
          title: all.length === 1 ? "Edição" : "Edições",
          icon: Icons.book,
          actions: attribution({ model, data, section: "Editions" }, h),
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

const withData = (
  { model, page }: Readonly<{ model: Model; page: Page }>,
  render: (state: SectionState) => ReadonlyArray<Html>,
): ReadonlyArray<Html> =>
  Option.match(AsyncData.getData(model.externalDataAsyncData), {
    onNone: () => [],
    onSome: (data) => render({ model, page, data }),
  })

/** The article's main column: what providers say about what it is. */
export const mainSections = (
  state: Readonly<{ model: Model; page: Page }>,
  h: WikiArticleViewBuilder,
): ReadonlyArray<Html> =>
  withData(state, (sectionState) => [...editions(sectionState, h), ...taxonomy(sectionState, h)])

export const mediaSection = (
  state: Readonly<{ model: Model; page: Page }>,
  h: WikiArticleViewBuilder,
): ReadonlyArray<Html> => withData(state, (sectionState) => media(sectionState, h))

export const wikipediaSection = (
  state: Readonly<{ model: Model; page: Page }>,
  h: WikiArticleViewBuilder,
): ReadonlyArray<Html> => withData(state, (sectionState) => wikipedia(sectionState, h))
