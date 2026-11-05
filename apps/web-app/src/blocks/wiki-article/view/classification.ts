import type { GbifClassification } from "@gororobas/domain/wiki/domain"
import { Style, When } from "@pleat/core"
import { Array as EffectArray, Option, Order, String as EffectString } from "effect"
import type { Html } from "foldkit/html"

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
  label: string
  /** Shown in the one-line breadcrumb, not only in the full classification. */
  isInBreadcrumb: boolean
  /** Family and subfamily say the most about a plant's kin, so they stand out. */
  isEmphasized: boolean
  /** Genus and below are written in italics, as botanical names are. */
  isItalic: boolean
}>

const rank = (label: string, flags: Partial<Omit<Rank, "label">> = {}): Rank => ({
  label,
  isInBreadcrumb: flags.isInBreadcrumb ?? false,
  isEmphasized: flags.isEmphasized ?? false,
  isItalic: flags.isItalic ?? false,
})

/** From broadest to narrowest; GBIF reports ranks in upper case. */
const ranks: ReadonlyArray<readonly [string, Rank]> = [
  ["DOMAIN", rank("Domínio")],
  ["KINGDOM", rank("Reino", { isInBreadcrumb: true })],
  ["SUBKINGDOM", rank("Sub-reino")],
  ["PHYLUM", rank("Filo")],
  ["CLASS", rank("Classe", { isInBreadcrumb: true })],
  ["ORDER", rank("Ordem", { isInBreadcrumb: true })],
  ["FAMILY", rank("Família", { isInBreadcrumb: true, isEmphasized: true })],
  ["SUBFAMILY", rank("Subfamília", { isInBreadcrumb: true, isEmphasized: true })],
  ["TRIBE", rank("Tribo")],
  ["SUBTRIBE", rank("Subtribo")],
  ["GENUS", rank("Gênero", { isInBreadcrumb: true, isItalic: true })],
  ["SPECIES", rank("Espécie", { isItalic: true })],
]

const rankOf = (taxonRank: string): Rank =>
  Option.getOrElse(
    Option.map(
      EffectArray.findFirst(ranks, ([known]) => known === taxonRank),
      ([, known]) => known,
    ),
    () => rank(EffectString.capitalize(EffectString.toLowerCase(taxonRank))),
  )

const rankIndex = (taxonRank: string): number => {
  const index = ranks.findIndex(([known]) => known === taxonRank)
  return index === -1 ? ranks.length : index
}

const byRank = Order.mapInput(Order.Number, (entry: GbifClassification) =>
  rankIndex(entry.taxonRank),
)

/** GBIF names groups in English. */
const taxonomyGroupNames: ReadonlyArray<readonly [string, string]> = [
  ["Angiosperms", "Angiospermas"],
  ["Gymnosperms", "Gimnospermas"],
  ["Pteridophytes", "Pteridófitas"],
  ["Bryophytes", "Briófitas"],
]

const taxonomyGroupName = (group: string): string =>
  Option.getOrElse(
    Option.map(
      EffectArray.findFirst(taxonomyGroupNames, ([english]) => english === group),
      ([, portuguese]) => portuguese,
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
  }: Readonly<{
    classification: ReadonlyArray<GbifClassification>
    taxonomyGroup: string | null
  }>,
  h: WikiArticleViewBuilder,
): Html =>
  h.dl(styledAttributes([], detailListStyle), [
    ...(taxonomyGroup === null
      ? []
      : [
          h.dt(styledAttributes([], termStyle), ["Grupo"]),
          h.dd(styledAttributes([], definitionStyle), [taxonomyGroupName(taxonomyGroup)]),
        ]),
    ...classification.flatMap((entry) => [
      h.dt(styledAttributes([], termStyle), [rankOf(entry.taxonRank).label]),
      h.dd(styledAttributes([], definitionStyle, ...nameStyles(entry)), [entry.scientificName]),
    ]),
  ])

/** A plant's kin in one line, from its kingdom to its genus; the whole classification behind it. */
export const view = (
  { model, page }: Readonly<{ model: Model; page: Page }>,
  h: WikiArticleViewBuilder,
): ReadonlyArray<Html> =>
  EffectArray.fromOption(
    Option.filter(Option.fromNullishOr(page.externalData.taxonomy), (taxonomy) =>
      EffectArray.isReadonlyArrayNonEmpty(taxonomy.classification),
    ),
  ).map((taxonomy) => {
    const classification = EffectArray.sort(taxonomy.classification, byRank)

    return h.block(
      ClassificationBinding.embedView({
        slotId: model.classification.id,
        model: model.classification,
        viewInputs: {
          title: "Classificação",
          trigger: {
            children: breadcrumb(classification, h),
            className: styledClassName(triggerStyle),
            ariaLabel: `Classificação: ${classification.map((entry) => entry.scientificName).join(", ")}`,
          },
          toContent: () => [
            h.div(styledAttributes([], contentStyle), [
              fullClassification({ classification, taxonomyGroup: taxonomy.taxonomyGroup }, h),
              ...EffectArray.fromOption(
                Option.map(findCredit(page, "GBIF"), (credit) => [
                  h.hr(styledAttributes([h.AriaHidden(true)], ruleStyle)),
                  attributionDetails(credit, h),
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
