import type { ExternalDataAttribution } from "@gororobas/domain/wiki/domain"
import { Style, When } from "@pleat/core"
import { Array as EffectArray, DateTime, Option } from "effect"
import type { Html } from "foldkit/html"

import { AppText } from "../../../ui/app-text"
import * as Icons from "../../../ui/icons"
import { styledAttributes, styledClassName } from "../../../ui/pleat-attributes"
import { ProviderMark } from "../../../ui/provider-mark"
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
} from "../../../ui/theme"
import { AttributionsBinding, attributionId, type WikiArticleViewBuilder } from "../composition"
import { type AttributedSection, type Model, attributedSectionProviders } from "../model"
import type { Page } from "./shared"

const triggerStyle = Style.make({
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

const panelStyle = Style.make({ inlineSize: "min(20rem, calc(100vw - 2rem))" })

const detailsStyle = Style.make({ display: "grid", rowGap: space[3] })

const headerStyle = Style.make({
  display: "flex",
  alignItems: "center",
  gap: space[2],
  fontSize: fontSize.large,
})

export const externalLinkStyle = Style.make({
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

export const detailListStyle = Style.make({
  display: "grid",
  gridTemplateColumns: "max-content 1fr",
  columnGap: space[4],
  rowGap: space[2],
  margin: 0,
})

export const termStyle = Style.make({ color: tones.neutral.shade[700] })
export const definitionStyle = Style.make({ margin: 0 })

const providerDescriptions: Readonly<Record<ExternalDataAttribution["provider"], string>> = {
  WIKIDATA:
    "Base de conhecimento livre e colaborativa da Wikimedia. Seus dados estão em domínio público (CC0).",
  GBIF: "Global Biodiversity Information Facility, rede aberta de dados sobre biodiversidade. A classificação segue o Catálogo da Vida, e cada foto mantém sua própria licença e autoria.",
  GOOGLE_BOOKS: "Informações das edições publicadas, segundo o catálogo do Google Livros.",
}

/** Where each provider's link leads: GBIF's taxa are Catalogue of Life's. */
const providerLinkLabels: Readonly<Record<ExternalDataAttribution["provider"], string>> = {
  WIKIDATA: "Ver no Wikidata",
  GBIF: "Ver no Catálogo da Vida",
  GOOGLE_BOOKS: "Ver no Google Livros",
}

const formatDate = (date: DateTime.Utc): string =>
  new Intl.DateTimeFormat("pt-BR", { dateStyle: "long", timeZone: "UTC" }).format(
    DateTime.toDate(date),
  )

export const externalLinkAttributes = (href: string, h: WikiArticleViewBuilder) => [
  h.Href(href),
  h.Attribute("target", "_blank"),
  h.Attribute("rel", "noopener noreferrer"),
]

export const findCredit = (
  page: Page,
  provider: ExternalDataAttribution["provider"],
): Option.Option<ExternalDataAttribution> =>
  EffectArray.findFirst(page.externalData.attributions, (credit) => credit.provider === provider)

/** What a provider is, when its data was read and where readers can check it. */
export const attributionDetails = (
  credit: ExternalDataAttribution,
  h: WikiArticleViewBuilder,
): Html => {
  const name = ProviderMark.names[credit.provider]

  return h.div(styledAttributes([], detailsStyle), [
    h.div(styledAttributes([], headerStyle), [
      ProviderMark.view(credit.provider),
      AppText.view({ element: "p", weight: "semibold", children: [`Dados do ${name}`] }, h),
    ]),
    AppText.view(
      {
        element: "p",
        appearance: "footnote",
        lineHeight: "relaxed",
        children: [providerDescriptions[credit.provider]],
      },
      h,
    ),
    h.dl(styledAttributes([], detailListStyle), [
      h.dt(styledAttributes([], termStyle), ["Identificador"]),
      h.dd(styledAttributes([], definitionStyle), [credit.externalId]),
      h.dt(styledAttributes([], termStyle), ["Atualizado em"]),
      h.dd(styledAttributes([], definitionStyle), [formatDate(credit.observedAt)]),
    ]),
    h.a(styledAttributes(externalLinkAttributes(credit.url, h), externalLinkStyle), [
      providerLinkLabels[credit.provider],
      Icons.arrowRight({ size: "sm" }),
    ]),
  ])
}

/** Credits a section's provider: its mark opens the details, as a popover or a drawer. */
export const attribution = (
  { model, page, section }: Readonly<{ model: Model; page: Page; section: AttributedSection }>,
  h: WikiArticleViewBuilder,
): ReadonlyArray<Html> => {
  const provider = attributedSectionProviders[section]
  const name = ProviderMark.names[provider]
  const maybeInstance = EffectArray.findFirst(
    model.attributions,
    (instance) => instance.id === attributionId(section),
  )

  return EffectArray.fromOption(
    Option.map(
      Option.all({ credit: findCredit(page, provider), instance: maybeInstance }),
      ({ credit, instance }) =>
        h.block(
          AttributionsBinding.embedView({
            key: instance.id,
            slotId: instance.id,
            model: instance,
            viewInputs: {
              title: `Dados do ${name}`,
              trigger: {
                children: [
                  ProviderMark.view(provider),
                  ...(ProviderMark.isWordmark[provider] ? [] : [name]),
                ],
                className: styledClassName(triggerStyle),
                ariaLabel: `Fonte: ${name}`,
              },
              toContent: () => [attributionDetails(credit, h)],
              anchor: { placement: "bottom-end", gap: 6, padding: 8 },
              panelClassName: styledClassName(panelStyle),
              tone: "primary",
            },
          }),
        ),
    ),
  )
}
