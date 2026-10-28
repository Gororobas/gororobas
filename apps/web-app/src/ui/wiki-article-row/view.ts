import type { BookmarkState } from "@gororobas/domain/common/enums"
import type { WikiArticleQueriedCardData } from "@gororobas/domain/wiki/domain"
import { Style, When } from "@pleat/core"
import { Array as EffectArray, Option } from "effect"
import type { Html, HtmlBuilder } from "foldkit/html"

import { wikiArticleUrl } from "../../app/route"
import { bookmarkLabels, plantBookmarkLabels, wikiKindLabels } from "../../lib/vocabulary"
import { ofName, primaryName } from "../../lib/wiki-article-names"
import { imageUrl } from "../../media-urls"
import { AppText } from "../app-text"
import * as Icons from "../icons"
import { iconSizeProperty } from "../icons/icon-size"
import { wikiKindIcons } from "../icons/wiki-kind-icons"
import { styledAttributes } from "../pleat-attributes"
import { focusRingDeclarations } from "../styles/focus-ring"
import { borderWidth, duration, fontWeight, radius, space, tones } from "../theme"
import { Thumbnail } from "../thumbnail"

const rowStyle = Style.make({
  display: "flex",
  alignItems: "center",
  gap: space[4],
  padding: space[1],
  borderRadius: radius.md,
  color: tones.neutral.shade[700],
  outline: "none",
}).pipe(Style.when(When.focusVisible, focusRingDeclarations))

// CARD: a color block holding the photo, and a cream panel curving into it with the names.

/** The panel overlaps the media by this much, so its curve sits over the photo. */
const PANEL_OVERLAP = space[8]

// Edged like publication cards, in the accent tone: a lighter lip along the top.
const cardStyle = Style.make({
  position: "relative",
  display: "grid",
  blockSize: "100%",
  minBlockSize: "7rem",
  gridTemplateColumns: `calc(6rem + ${PANEL_OVERLAP}) minmax(0, 1fr)`,
  overflow: "hidden",
  borderWidth: borderWidth.thick,
  borderStyle: "solid",
  borderColor: tones.accent.background,
  borderBlockStartColor: tones.accent.shade[400],
  borderRadius: space[7],
  cornerShape: "squircle",
  backgroundColor: tones.primary.ramp[300],
  color: tones.neutral.shade[800],
  outline: "none",
  transition: `transform ${duration.fast}`,
}).pipe(
  Style.when(When.hover, { transform: "translateY(-0.125rem)" }),
  Style.when(When.focusVisible, focusRingDeclarations),
)

const cardMediaStyle = Style.make({
  position: "relative",
  display: "grid",
  placeItems: "center",
  paddingInlineEnd: PANEL_OVERLAP,
})

const cardImageStyle = Style.make({
  position: "absolute",
  inset: 0,
  inlineSize: "100%",
  blockSize: "100%",
  objectFit: "cover",
})

const cardFallbackStyle = Style.make({
  display: "grid",
  placeItems: "center",
  color: tones.accent.ramp[700],
  [iconSizeProperty]: "3rem",
})

const cardPanelStyle = Style.make({
  position: "relative",
  display: "grid",
  alignContent: "center",
  justifyItems: "start",
  rowGap: space[1],
  marginInlineStart: `calc(-1 * ${PANEL_OVERLAP})`,
  paddingBlock: space[3],
  paddingInline: space[4],
  borderStartStartRadius: "2.5rem",
  borderEndStartRadius: "1.25rem",
  backgroundColor: tones.primary.backgroundCard,
})

const cardKindStyle = Style.make({
  paddingBlock: `calc(${space[1]} / 2)`,
  paddingInline: space[2],
  borderRadius: radius.full,
  backgroundColor: tones.accent.ramp[100],
  color: tones.accent.ramp[800],
  fontWeight: fontWeight.semibold,
})

/** Resource titles can be whole sentences; three lines keep cards comparable. */
const cardNameStyle = Style.make({
  display: "-webkit-box",
  overflow: "hidden",
  color: tones.secondary.emphasis,
  fontWeight: fontWeight.bold,
  overflowWrap: "anywhere",
  WebkitBoxOrient: "vertical",
  WebkitLineClamp: 3,
})

const cardScientificNameStyle = Style.make({ fontStyle: "italic", color: tones.neutral.shade[700] })

const cardBookmarkStyle = Style.make({
  position: "absolute",
  insetBlockStart: space[2],
  insetInlineEnd: space[2],
  color: tones.accent.ramp[700],
})

const textStyle = Style.make({ display: "grid", flex: 1, minInlineSize: 0 })
const nameStyle = Style.make({ color: tones.neutral.shade[700] })
const bookmarkStyle = Style.make({ color: tones.neutral.shade[600] })

export type WikiArticleRowConfig = Readonly<{
  article: WikiArticleQueriedCardData
  /** Subtitles and similar details shown under the name, such as an author. */
  maybeSubtitle?: Option.Option<string>
  maybeBookmarkState?: Option.Option<BookmarkState>
  isCard?: boolean
}>

/** "Variedade do Milho" when a cultivar's plant is known, otherwise the kind's name. */
const kindLabel = (article: WikiArticleQueriedCardData): string =>
  Option.match(article.parentPlantName, {
    onNone: () => wikiKindLabels[article.kind].singular,
    onSome: (parent) =>
      `${wikiKindLabels[article.kind].singular} ${ofName({ commonNames: [parent], handle: parent.name })}`,
  })

const bookmarkLabel = (config: WikiArticleRowConfig): Option.Option<string> =>
  Option.map(config.maybeBookmarkState ?? Option.none(), (state) =>
    config.article.kind === "PLANT" ? plantBookmarkLabels[state] : bookmarkLabels[state],
  )

/** One article in a results grid. Without a photo, its kind's icon stands in. */
const card = <Message>(config: WikiArticleRowConfig, h: HtmlBuilder<Message>): Html => {
  const { article } = config
  const name = primaryName(article)

  return h.a(styledAttributes([h.Href(wikiArticleUrl(article))], cardStyle), [
    h.div(styledAttributes([], cardMediaStyle), [
      Option.match(article.thumbnailMediaAssetId, {
        onNone: () =>
          h.div(styledAttributes([h.AriaHidden(true)], cardFallbackStyle), [
            wikiKindIcons[article.kind]({ mode: "duotone", size: "lg" }),
          ]),
        onSome: (id) =>
          h.img(
            styledAttributes(
              [h.Src(imageUrl(id, 300)), h.Alt(name), h.Attribute("loading", "lazy")],
              cardImageStyle,
            ),
          ),
      }),
    ]),
    h.div(styledAttributes([], cardPanelStyle), [
      AppText.view(
        {
          element: "span",
          appearance: "caption",
          styles: [cardKindStyle],
          children: [kindLabel(article)],
        },
        h,
      ),
      AppText.view(
        {
          element: "span",
          appearance: "xl",
          lineHeight: "tight",
          styles: [cardNameStyle],
          children: [name],
        },
        h,
      ),
      ...EffectArray.fromOption(
        Option.map(EffectArray.head(article.scientificNames), (scientificName) =>
          AppText.view(
            {
              element: "span",
              appearance: "footnote",
              styles: [cardScientificNameStyle],
              children: [scientificName],
            },
            h,
          ),
        ),
      ),
    ]),
    ...EffectArray.fromOption(
      Option.map(bookmarkLabel(config), (label) =>
        h.span(styledAttributes([h.Title(label), h.AriaLabel(label)], cardBookmarkStyle), [
          Icons.bookmarkCheck({ size: "md", mode: "duotone" }),
        ]),
      ),
    ),
  ])
}

/** A linked line for one article: thumbnail, kind, name and scientific name. */
export const view = <Message>(config: WikiArticleRowConfig, h: HtmlBuilder<Message>): Html => {
  if (config.isCard === true) return card(config, h)

  const { article } = config
  const name = primaryName(article)
  const subtitle = Option.orElse(config.maybeSubtitle ?? Option.none(), () =>
    EffectArray.head(article.scientificNames),
  )

  return h.a(styledAttributes([h.Href(wikiArticleUrl(article))], rowStyle), [
    Thumbnail.view({ maybeMediaAssetId: article.thumbnailMediaAssetId, alt: name }, h),
    h.div(styledAttributes([], textStyle), [
      AppText.view({ appearance: "caption", isMuted: true, children: [kindLabel(article)] }, h),
      AppText.view(
        {
          element: "span",
          appearance: "large",
          weight: "semibold",
          lineHeight: "tight",
          styles: [nameStyle],
          children: [name],
        },
        h,
      ),
      ...EffectArray.fromOption(
        Option.map(subtitle, (text) =>
          AppText.view({ appearance: "footnote", element: "span", children: [text] }, h),
        ),
      ),
    ]),
    ...EffectArray.fromOption(
      Option.map(bookmarkLabel(config), (label) =>
        h.span(styledAttributes([h.Title(label), h.AriaLabel(label)], bookmarkStyle), [
          Icons.bookmarkCheck({ size: "md" }),
        ]),
      ),
    ),
  ])
}
