import type { SupportedLanguage } from "@gororobas/domain/common/enums"
import type { ExternalDataAttribution } from "@gororobas/domain/wiki/domain"
import type { MessageDescriptor } from "@lingui/core"
import { msg } from "@lingui/core/macro"
import { Style, When } from "@pleat/core"
import { Array as EffectArray, DateTime, Option } from "effect"
import type { Html } from "foldkit/html"

import { intlTags } from "../../../lib/language"
import { translatorFor } from "../../../lib/translations"
import { AppText } from "../../../ui/app-text"
import * as Icons from "../../../ui/icons"
import { MediaCredit } from "../../../ui/media-credit"
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
import type { ArticlePhoto } from "./photos"
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

const providerDescriptions: Readonly<
  Record<ExternalDataAttribution["provider"], MessageDescriptor>
> = {
  WIKIDATA: msg`Wikimedia's free and collaborative knowledge base. Its data is in the public domain (CC0).`,
  GBIF: msg`Global Biodiversity Information Facility, an open network of biodiversity data. Its classification follows the Catalogue of Life, and each photo keeps its own license and authorship.`,
  GOOGLE_BOOKS: msg`Information on published editions, from the Google Books catalog.`,
}

/** Where each provider's link leads: GBIF's taxa are Catalogue of Life's. */
const providerLinkLabels: Readonly<Record<ExternalDataAttribution["provider"], MessageDescriptor>> =
  {
    WIKIDATA: msg`See on Wikidata`,
    GBIF: msg`See on the Catalogue of Life`,
    GOOGLE_BOOKS: msg`See on Google Books`,
  }

const formatDate = (date: DateTime.Utc, language: SupportedLanguage): string =>
  new Intl.DateTimeFormat(intlTags[language], { dateStyle: "long", timeZone: "UTC" }).format(
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
  { credit, language }: Readonly<{ credit: ExternalDataAttribution; language: SupportedLanguage }>,
  h: WikiArticleViewBuilder,
): Html => {
  const name = ProviderMark.names[credit.provider]
  const i18n = translatorFor(language)

  return h.div(styledAttributes([], detailsStyle), [
    h.div(styledAttributes([], headerStyle), [
      ProviderMark.view(credit.provider),
      AppText.view(
        { element: "p", weight: "semibold", children: [i18n._(msg`Data from ${name}`)] },
        h,
      ),
    ]),
    AppText.view(
      {
        element: "p",
        appearance: "footnote",
        lineHeight: "relaxed",
        children: [i18n._(providerDescriptions[credit.provider])],
      },
      h,
    ),
    h.dl(styledAttributes([], detailListStyle), [
      h.dt(styledAttributes([], termStyle), [i18n._(msg`Identifier`)]),
      h.dd(styledAttributes([], definitionStyle), [credit.externalId]),
      h.dt(styledAttributes([], termStyle), [i18n._(msg`Updated on`)]),
      h.dd(styledAttributes([], definitionStyle), [formatDate(credit.observedAt, language)]),
    ]),
    h.a(styledAttributes(externalLinkAttributes(credit.url, h), externalLinkStyle), [
      i18n._(providerLinkLabels[credit.provider]),
      Icons.arrowRight({ size: "sm" }),
    ]),
  ])
}

/** Credits a section's provider: its mark opens the details, as a popover or a drawer. */
export const attribution = (
  {
    model,
    language,
    page,
    section,
  }: Readonly<{
    model: Model
    language: SupportedLanguage
    page: Page
    section: AttributedSection
  }>,
  h: WikiArticleViewBuilder,
): ReadonlyArray<Html> => {
  const provider = attributedSectionProviders[section]
  const name = ProviderMark.names[provider]
  const i18n = translatorFor(language)
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
              title: i18n._(msg`Data from ${name}`),
              trigger: {
                children: [
                  ProviderMark.view(provider),
                  ...(ProviderMark.isWordmark[provider] ? [] : [name]),
                ],
                className: styledClassName(triggerStyle),
                ariaLabel: i18n._(msg`Source: ${name}`),
              },
              toContent: () => [attributionDetails({ credit, language }, h)],
              anchor: { placement: "bottom-end", gap: 6, padding: 8 },
              panelClassName: styledClassName(panelStyle),
              tone: "primary",
            },
          }),
        ),
    ),
  )
}

/** Who to credit for a photo: a badge over its corner opens the details, as a popover or drawer. */
export const photoCredit = (
  {
    model,
    language,
    photo,
    corner = "bottomStart",
  }: Readonly<{
    model: Model
    language: SupportedLanguage
    photo: ArticlePhoto
    corner?: "bottomStart" | "topEnd"
  }>,
  h: WikiArticleViewBuilder,
): ReadonlyArray<Html> =>
  MediaCredit.hasCredits(photo.attribution)
    ? EffectArray.fromOption(
        Option.map(
          EffectArray.findFirst(model.attributions, (instance) => instance.id === photo.creditId),
          (instance) =>
            MediaCredit.corner(
              {
                corner,
                badge: h.block(
                  AttributionsBinding.embedView({
                    key: instance.id,
                    slotId: instance.id,
                    model: instance,
                    viewInputs: MediaCredit.popoverDrawerInputs(
                      { attribution: photo.attribution, i18n: translatorFor(language), corner },
                      h,
                    ),
                  }),
                ),
              },
              h,
            ),
        ),
      )
    : []
