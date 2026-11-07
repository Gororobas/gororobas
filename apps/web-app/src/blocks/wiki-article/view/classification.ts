import type { SupportedLanguage } from "@gororobas/domain/common/enums"
import type { GbifClassification } from "@gororobas/domain/wiki/domain"
import type { MessageDescriptor } from "@lingui/core"
import { msg } from "@lingui/core/macro"
import { Style, When } from "@pleat/core"
import { Array as EffectArray, Option, Order, String as EffectString } from "effect"
import type { Html } from "foldkit/html"

import { type Translator, translatorFor } from "../../../lib/translations"
import * as Icons from "../../../ui/icons"
import { styledAttributes, styledClassName } from "../../../ui/pleat-attributes"
import { focusRingDeclarations } from "../../../ui/styles/focus-ring"
import {
  borderWidth,
  duration,
  fontWeight,
  radius,
  space,
  toneColors,
  tones,
} from "../../../ui/theme"
import { ClassificationBinding, type WikiArticleViewBuilder } from "../composition"
import type { Model } from "../model"
import {
  attributionDetails,
  definitionStyle,
  detailListStyle,
  findCredit,
  termStyle,
} from "./attribution"
import type { Page } from "./shared"

type Rank = Readonly<{
  maybeLabel: Option.Option<MessageDescriptor>
  /** Shown in the header's one-line breadcrumb (family and genus); every rank is in the full classification. */
  isInBreadcrumb: boolean
  /** Family and subfamily say the most about a plant's kin, so they stand out. */
  isEmphasized: boolean
  /** Genus and below are written in italics, as botanical names are. */
  isItalic: boolean
}>

const rank = (
  maybeLabel: Option.Option<MessageDescriptor>,
  flags: Partial<Omit<Rank, "maybeLabel">> = {},
): Rank => ({
  maybeLabel,
  isInBreadcrumb: flags.isInBreadcrumb ?? false,
  isEmphasized: flags.isEmphasized ?? false,
  isItalic: flags.isItalic ?? false,
})

/** From broadest to narrowest; GBIF reports ranks in upper case. */
const ranks: ReadonlyArray<readonly [string, Rank]> = [
  ["DOMAIN", rank(Option.some(msg({ message: "Domain", context: "taxonomic rank" })))],
  ["KINGDOM", rank(Option.some(msg({ message: "Kingdom", context: "taxonomic rank" })))],
  ["SUBKINGDOM", rank(Option.some(msg({ message: "Subkingdom", context: "taxonomic rank" })))],
  ["PHYLUM", rank(Option.some(msg({ message: "Phylum", context: "taxonomic rank" })))],
  ["CLASS", rank(Option.some(msg({ message: "Class", context: "taxonomic rank" })))],
  ["ORDER", rank(Option.some(msg({ message: "Order", context: "taxonomic rank" })))],
  [
    "FAMILY",
    rank(Option.some(msg({ message: "Family", context: "taxonomic rank" })), {
      isInBreadcrumb: true,
      isEmphasized: true,
    }),
  ],
  [
    "SUBFAMILY",
    rank(Option.some(msg({ message: "Subfamily", context: "taxonomic rank" })), {
      isEmphasized: true,
    }),
  ],
  ["TRIBE", rank(Option.some(msg({ message: "Tribe", context: "taxonomic rank" })))],
  ["SUBTRIBE", rank(Option.some(msg({ message: "Subtribe", context: "taxonomic rank" })))],
  [
    "GENUS",
    rank(Option.some(msg({ message: "Genus", context: "taxonomic rank" })), {
      isInBreadcrumb: true,
      isItalic: true,
    }),
  ],
  [
    "SPECIES",
    rank(Option.some(msg({ message: "Species", context: "taxonomic rank" })), { isItalic: true }),
  ],
]

const rankOf = (taxonRank: string): Rank =>
  Option.getOrElse(
    Option.map(
      EffectArray.findFirst(ranks, ([known]) => known === taxonRank),
      ([, known]) => known,
    ),
    () => rank(Option.none()),
  )

/** Ranks GBIF reports beyond the known ones read as written, such as "Section". */
const rankLabel = (taxonRank: string, i18n: Translator): string =>
  Option.match(rankOf(taxonRank).maybeLabel, {
    onNone: () => EffectString.capitalize(EffectString.toLowerCase(taxonRank)),
    onSome: (label) => i18n._(label),
  })

const rankIndex = (taxonRank: string): number => {
  const index = ranks.findIndex(([known]) => known === taxonRank)
  return index === -1 ? ranks.length : index
}

const byRank = Order.mapInput(Order.Number, (entry: GbifClassification) =>
  rankIndex(entry.taxonRank),
)

/** GBIF names groups in English. */
const taxonomyGroupNames: ReadonlyArray<readonly [string, MessageDescriptor]> = [
  ["Angiosperms", msg`Angiosperms`],
  ["Gymnosperms", msg`Gymnosperms`],
  ["Pteridophytes", msg`Pteridophytes`],
  ["Bryophytes", msg`Bryophytes`],
]

const taxonomyGroupName = (group: string, i18n: Translator): string =>
  Option.getOrElse(
    Option.map(
      EffectArray.findFirst(taxonomyGroupNames, ([english]) => english === group),
      ([, name]) => i18n._(name),
    ),
    () => group,
  )

// STYLES

/**
 * One line however narrow the screen: right-to-left overflow puts the ellipsis before the
 * broadest ranks, so the most specific ones stay visible.
 */
const triggerStyle = Style.make({
  display: "flex",
  alignItems: "center",
  gap: space[1],
  maxInlineSize: "100%",
  paddingBlock: space[1],
  paddingInline: space[2],
  marginInlineStart: `calc(-1 * ${space[2]})`,
  border: "none",
  borderRadius: radius.full,
  cornerShape: "squircle",
  backgroundColor: "transparent",
  color: tones.neutral.shade[700],
  cursor: "pointer",
  outline: "none",
  transitionProperty: "background-color",
  transitionDuration: duration.control,
}).pipe(
  Style.when(When.hover, { backgroundColor: toneColors.hover }),
  Style.when(When.focusVisible, focusRingDeclarations),
)

const crumbsStyle = Style.make({
  minInlineSize: 0,
  overflow: "hidden",
  whiteSpace: "nowrap",
  textOverflow: "ellipsis",
  direction: "rtl",
  textAlign: "start",
})

const crumbsTextStyle = Style.make({ direction: "ltr", unicodeBidi: "isolate" })
const separatorStyle = Style.make({ color: tones.neutral.shade[400] })
const emphasizedStyle = Style.make({
  color: tones.neutral.shade[900],
  fontWeight: fontWeight.semibold,
})
const italicStyle = Style.make({ fontStyle: "italic" })
const panelStyle = Style.make({ inlineSize: "min(22rem, calc(100vw - 2rem))" })
const contentStyle = Style.make({ display: "grid", rowGap: space[4] })

const ruleStyle = Style.make({
  blockSize: borderWidth.hairline,
  margin: 0,
  border: "none",
  backgroundColor: toneColors.border,
})

// VIEW

const nameStyles = (entry: GbifClassification): ReadonlyArray<Style.Style> => {
  const { isEmphasized, isItalic } = rankOf(entry.taxonRank)
  return [...(isEmphasized ? [emphasizedStyle] : []), ...(isItalic ? [italicStyle] : [])]
}

const breadcrumb = (
  classification: ReadonlyArray<GbifClassification>,
  h: WikiArticleViewBuilder,
): ReadonlyArray<Html> => [
  h.span(styledAttributes([], crumbsStyle), [
    h.span(
      styledAttributes([], crumbsTextStyle),
      classification
        .filter((entry) => rankOf(entry.taxonRank).isInBreadcrumb)
        .flatMap((entry, index) => [
          ...(index === 0
            ? []
            : [h.span(styledAttributes([h.AriaHidden(true)], separatorStyle), [" › "])]),
          h.span(styledAttributes([], ...nameStyles(entry)), [entry.scientificName]),
        ]),
    ),
  ]),
  Icons.chevronDown({ size: "sm" }),
]

const fullClassification = (
  {
    classification,
    taxonomyGroup,
    i18n,
  }: Readonly<{
    classification: ReadonlyArray<GbifClassification>
    taxonomyGroup: string | null
    i18n: Translator
  }>,
  h: WikiArticleViewBuilder,
): Html =>
  h.dl(styledAttributes([], detailListStyle), [
    ...(taxonomyGroup === null
      ? []
      : [
          h.dt(styledAttributes([], termStyle), [i18n._(msg`Group`)]),
          h.dd(styledAttributes([], definitionStyle), [taxonomyGroupName(taxonomyGroup, i18n)]),
        ]),
    ...classification.flatMap((entry) => [
      h.dt(styledAttributes([], termStyle), [rankLabel(entry.taxonRank, i18n)]),
      h.dd(styledAttributes([], definitionStyle, ...nameStyles(entry)), [entry.scientificName]),
    ]),
  ])

/** A plant's kin in one line, from its kingdom to its genus; the whole classification behind it. */
export const view = (
  { model, language, page }: Readonly<{ model: Model; language: SupportedLanguage; page: Page }>,
  h: WikiArticleViewBuilder,
): ReadonlyArray<Html> =>
  EffectArray.fromOption(
    Option.filter(Option.fromNullishOr(page.externalData.taxonomy), (taxonomy) =>
      EffectArray.isReadonlyArrayNonEmpty(taxonomy.classification),
    ),
  ).map((taxonomy) => {
    const classification = EffectArray.sort(taxonomy.classification, byRank)
    const i18n = translatorFor(language)
    const names = classification.map((entry) => entry.scientificName).join(", ")

    return h.block(
      ClassificationBinding.embedView({
        slotId: model.classification.id,
        model: model.classification,
        viewInputs: {
          title: i18n._(msg`Classification`),
          trigger: {
            children: breadcrumb(classification, h),
            className: styledClassName(triggerStyle),
            ariaLabel: i18n._(msg`Classification: ${names}`),
          },
          toContent: () => [
            h.div(styledAttributes([], contentStyle), [
              fullClassification(
                { classification, taxonomyGroup: taxonomy.taxonomyGroup, i18n },
                h,
              ),
              ...EffectArray.fromOption(
                Option.map(findCredit(page, "GBIF"), (credit) => [
                  h.hr(styledAttributes([h.AriaHidden(true)], ruleStyle)),
                  attributionDetails({ credit, language }, h),
                ]),
              ).flat(),
            ]),
          ],
          panelClassName: styledClassName(panelStyle),
          tone: "primary",
        },
      }),
    )
  })
