import type { SupportedLanguage } from "@gororobas/domain/common/enums"
import { msg } from "@lingui/core/macro"
import { Style, When } from "@pleat/core"
import { Array as EffectArray, Option, String as EffectString } from "effect"
import type { Html } from "foldkit/html"

import type { Translator } from "../../../../lib/translations"
import { AppText } from "../../../../ui/app-text"
import { Chip } from "../../../../ui/chip"
import * as Icons from "../../../../ui/icons"
import { styledAttributes } from "../../../../ui/pleat-attributes"
import { SectionCard } from "../../../../ui/section-card"
import { focusRingDeclarations } from "../../../../ui/styles/focus-ring"
import { borderWidth, breakpoint, duration, radius, space, tones } from "../../../../ui/theme"
import { UntranslatedNotice } from "../../../../ui/untranslated-notice"
import type { WikiArticleViewBuilder } from "../../composition"

const factsStyle = Style.make({ display: "grid" })

/** Label and description on the left, values on the right, as on gororobas.com. */
const factStyle = Style.make({
  display: "grid",
  gridTemplateColumns: "minmax(0, 2fr) minmax(0, 3fr)",
  alignItems: "start",
  columnGap: space[4],
  paddingBlock: space[3],
  borderBlockStart: `${borderWidth.hairline} solid ${tones.primary.shade[300]}`,
}).pipe(
  Style.when(When.firstChild, { borderBlockStart: 0, paddingBlockStart: 0 }),
  Style.when(breakpoint.sm, { gridTemplateColumns: "minmax(0, 12.5rem) minmax(0, 1fr)" }),
)

const factLabelStyle = Style.make({ display: "grid", rowGap: space[1] })
const factTitleStyle = Style.make({ color: tones.neutral.shade[800] })
const factDescriptionStyle = Style.make({ color: tones.neutral.shade[600] })

const valueWithNoteStyle = Style.make({ display: "grid", rowGap: space[2] })

const chipsStyle = Style.make({ display: "flex", flexWrap: "wrap", gap: space[2] })

const namesStyle = Style.make({ display: "flex", flexWrap: "wrap", columnGap: space[3] })

/** Underlined links, inside Gororobas or out. */
/** Links out of Gororobas, such as where to find a book or its Wikipedia article. */
export const linkStyle = Style.make({
  display: "inline-flex",
  alignItems: "center",
  gap: space[1],
  maxInlineSize: "100%",
  marginInlineStart: `calc(-1 * ${space[1]})`,
  paddingInline: space[1],
  borderRadius: radius.sm,
  color: tones.accent.shade[800],
  overflowWrap: "anywhere",
  textDecorationLine: "underline",
  textDecorationColor: tones.accent.shade[300],
  textUnderlineOffset: "0.2em",
  outline: "none",
  transitionProperty: "text-decoration-color",
  transitionDuration: duration.control,
}).pipe(
  Style.when(When.hover, { textDecorationColor: tones.accent.shade[700] }),
  Style.when(When.focusVisible, focusRingDeclarations),
)

type FactNote = Readonly<{
  /** Where the value comes from, when it isn't the article's own, such as a parent plant. */
  maybeNote?: Option.Option<string>
}>

const withNote = (
  { content, maybeNote = Option.none() }: Readonly<{ content: Html }> & FactNote,
  h: WikiArticleViewBuilder,
): Html =>
  Option.match(maybeNote, {
    onNone: () => content,
    onSome: (note) =>
      h.div(styledAttributes([], valueWithNoteStyle), [
        content,
        AppText.view(
          {
            element: "p",
            appearance: "footnote",
            lineHeight: "tight",
            styles: [factDescriptionStyle],
            children: [note],
          },
          h,
        ),
      ]),
  })

export const fact = (
  {
    title,
    maybeDescription = Option.none(),
    maybeNote = Option.none(),
    content,
  }: Readonly<{ title: string; maybeDescription?: Option.Option<string>; content: Html }> &
    FactNote,
  h: WikiArticleViewBuilder,
): Html =>
  h.div(styledAttributes([], factStyle), [
    h.div(styledAttributes([], factLabelStyle), [
      AppText.view(
        {
          element: "h3",
          appearance: "regular",
          weight: "semibold",
          lineHeight: "tight",
          styles: [factTitleStyle],
          children: [title],
        },
        h,
      ),
      ...EffectArray.fromOption(
        Option.map(maybeDescription, (description) =>
          AppText.view(
            {
              element: "p",
              appearance: "footnote",
              lineHeight: "tight",
              styles: [factDescriptionStyle],
              children: [description],
            },
            h,
          ),
        ),
      ),
    ]),
    withNote({ content, maybeNote }, h),
  ])

export const chipFact = <Value extends string>(
  {
    id,
    title,
    maybeDescription = Option.none(),
    maybeValues,
    maybeNote = Option.none(),
    labels,
    explainers,
  }: FactNote &
    Readonly<{
      /** Prefixes each explainer's ID, unique within the page. */
      id: string
      title: string
      maybeDescription?: Option.Option<string>
      maybeValues: Option.Option<ReadonlyArray<Value>>
      labels: Readonly<Record<Value, string>>
      explainers?: Readonly<Record<Value, string>>
    }>,
  h: WikiArticleViewBuilder,
): ReadonlyArray<Html> =>
  EffectArray.fromOption(
    Option.map(Option.filter(maybeValues, EffectArray.isReadonlyArrayNonEmpty), (values) =>
      fact(
        {
          title,
          maybeDescription,
          maybeNote,
          content: h.div(
            styledAttributes([], chipsStyle),
            values.map((value) =>
              explainers === undefined
                ? Chip.view({ label: labels[value] }, h)
                : Chip.explained(
                    {
                      id: `${id}-${value.toLowerCase()}`,
                      label: labels[value],
                      explainer: explainers[value],
                    },
                    h,
                  ),
            ),
          ),
        },
        h,
      ),
    ),
  )

/** Free-text values contributors typed, such as a film's genres, as chips. */
export const freeChipFact = (
  {
    title,
    maybeValues,
  }: Readonly<{ title: string; maybeValues: Option.Option<ReadonlyArray<string>> }>,
  h: WikiArticleViewBuilder,
): ReadonlyArray<Html> =>
  EffectArray.fromOption(
    Option.map(Option.filter(maybeValues, EffectArray.isReadonlyArrayNonEmpty), (values) =>
      fact(
        {
          title,
          content: h.div(
            styledAttributes([], chipsStyle),
            values.map((value) => Chip.view({ label: value }, h)),
          ),
        },
        h,
      ),
    ),
  )

/** Hides blank text, which imported articles sometimes carry instead of nothing. */
export const textFact = (
  {
    title,
    maybeDescription = Option.none(),
    maybeText,
    maybeNote = Option.none(),
  }: FactNote &
    Readonly<{
      title: string
      maybeDescription?: Option.Option<string>
      maybeText: Option.Option<string>
    }>,
  h: WikiArticleViewBuilder,
): ReadonlyArray<Html> =>
  EffectArray.fromOption(
    Option.map(
      Option.filter(maybeText, (text) => EffectString.isNonEmpty(EffectString.trim(text))),
      (text) =>
        fact(
          {
            title,
            maybeDescription,
            maybeNote,
            content: AppText.view({ element: "p", lineHeight: "tight", children: [text] }, h),
          },
          h,
        ),
    ),
  )

/** Names listed side by side, such as other common names. */
export const namesFact = (
  { title, names, maybeNote }: Readonly<{ title: string; names: ReadonlyArray<string> }> & FactNote,
  h: WikiArticleViewBuilder,
): ReadonlyArray<Html> =>
  EffectArray.match(names, {
    onEmpty: () => [],
    onNonEmpty: (nonEmpty) => [
      fact(
        {
          title,
          content: AppText.view(
            {
              element: "p",
              attributes: styledAttributes([], namesStyle),
              children: nonEmpty.map((name) => h.span([], [name])),
            },
            h,
          ),
          ...(maybeNote === undefined ? {} : { maybeNote }),
        },
        h,
      ),
    ],
  })

/** "companhiadasletras.com.br": enough to know where the link leads, as paths are mostly noise. */
const displayUrl = (url: URL): string => url.hostname.replace(/^www\./, "")

const externalLinkFact = (
  { title, url, label }: Readonly<{ title: string; url: URL; label: string }>,
  h: WikiArticleViewBuilder,
): Html =>
  fact(
    {
      title,
      content: AppText.view(
        {
          element: "p",
          attributes: [],
          children: [
            h.a(
              styledAttributes(
                [h.Href(url.href), h.Target("_blank"), h.Rel("noopener noreferrer")],
                linkStyle,
              ),
              [Icons.link({ size: "sm" }), label],
            ),
          ],
        },
        h,
      ),
    },
    h,
  )

/** A link that leaves Gororobas, opening in a new tab. */
export const linkFact = (
  { title, maybeUrl }: Readonly<{ title: string; maybeUrl: Option.Option<URL> }>,
  h: WikiArticleViewBuilder,
): ReadonlyArray<Html> =>
  EffectArray.fromOption(
    Option.map(maybeUrl, (url) => externalLinkFact({ title, url, label: displayUrl(url) }, h)),
  )

/** An ID in another database, such as Wikidata's "Q1409503", linking to its entry there. */
export const identifierFact = <Id extends string>(
  {
    title,
    maybeId,
    toUrl,
  }: Readonly<{ title: string; maybeId: Option.Option<Id>; toUrl: (id: Id) => URL }>,
  h: WikiArticleViewBuilder,
): ReadonlyArray<Html> =>
  EffectArray.fromOption(
    Option.map(maybeId, (id) => externalLinkFact({ title, url: toUrl(id), label: id }, h)),
  )

export const rangeText = ({
  minimum,
  maximum,
  i18n,
}: Readonly<{ minimum: string; maximum: string; i18n: Translator }>): string =>
  minimum === maximum ? minimum : i18n._(msg`From ${minimum} to ${maximum}`)

/** The article's facts in one card, or nothing when it has none. */
export const overviewCard = (
  { facts, i18n }: Readonly<{ facts: ReadonlyArray<Html>; i18n: Translator }>,
  h: WikiArticleViewBuilder,
): Html =>
  EffectArray.match(facts, {
    onEmpty: () => h.empty,
    onNonEmpty: (nonEmpty) =>
      SectionCard.view(
        {
          title: i18n._(msg`Overview`),
          icon: Icons.clipboardCheck,
          children: [h.div(styledAttributes([], factsStyle), nonEmpty)],
        },
        h,
      ),
  })

/**
 * For facts the article's translation holds, such as other names or a plant's origin: what to note
 * when the reader's language has none and they read in another.
 */
export const untranslatedNote = ({
  contentLanguage,
  readerLanguage,
  i18n,
}: Readonly<{
  contentLanguage: SupportedLanguage
  readerLanguage: SupportedLanguage
  i18n: Translator
}>): Option.Option<string> =>
  Option.map(
    UntranslatedNotice.maybeFallbackLanguage({ contentLanguage, readerLanguage }),
    (fallback) => UntranslatedNotice.label({ contentLanguage: fallback, readerLanguage, i18n }),
  )
