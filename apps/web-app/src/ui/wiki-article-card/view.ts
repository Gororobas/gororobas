import type { BookmarkState, SupportedLanguage } from "@gororobas/domain/common/enums"
import type { WikiArticleQueriedCardData } from "@gororobas/domain/wiki/domain"
import { Style, When } from "@pleat/core"
import { Array as EffectArray, Option } from "effect"
import type { Html, HtmlBuilder } from "foldkit/html"

import { wikiArticleUrl } from "../../app/route"
import { translatorFor } from "../../lib/translations"
import { bookmarkLabel, kindLabel } from "../../lib/wiki-article-labels"
import { primaryName } from "../../lib/wiki-article-names"
import { articleThumbnailUrl } from "../../media-urls"
import { AppText } from "../app-text"
import * as Icons from "../icons"
import { iconSizeProperty } from "../icons/icon-size"
import { wikiKindIcons } from "../icons/wiki-kind-icons"
import { LoadingState } from "../loading-state"
import { styledAttributes } from "../pleat-attributes"
import { focusRingDeclarations } from "../styles/focus-ring"
import { borderWidth, duration, fontWeight, radius, space, tones } from "../theme"

// A color block holding a square photo, and a cream panel curving into it with the names.

/** The photo's visible side. */
const MEDIA_SIZE = "7rem"

/** The panel overlaps the media by this much, so its curve sits over the photo. */
const PANEL_OVERLAP = space[8]

// Edged like publication cards, in the accent tone: a lighter lip along the top.
const cardStyle = Style.make({
  position: "relative",
  display: "grid",
  blockSize: "100%",
  minBlockSize: MEDIA_SIZE,
  gridTemplateColumns: "auto minmax(0, 1fr)",
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

/** A square photo: the overlap sits in the padding, so what shows beside the panel is 1:1. */
const cardMediaStyle = Style.make({
  position: "relative",
  display: "grid",
  placeItems: "center",
  alignSelf: "start",
  boxSizing: "content-box",
  inlineSize: MEDIA_SIZE,
  aspectRatio: "1",
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

export type WikiArticleCardConfig = Readonly<{
  language: SupportedLanguage
  article: WikiArticleQueriedCardData
  maybeBookmarkState?: Option.Option<BookmarkState>
}>

/** One article in a results grid. Without a photo, its kind's icon stands in. */
export const view = <Message>(config: WikiArticleCardConfig, h: HtmlBuilder<Message>): Html => {
  const { article } = config
  const name = primaryName(article)

  return h.a(styledAttributes([h.Href(wikiArticleUrl(config.language, article))], cardStyle), [
    h.div(styledAttributes([], cardMediaStyle), [
      Option.match(articleThumbnailUrl(article), {
        onNone: () =>
          h.div(styledAttributes([h.AriaHidden(true)], cardFallbackStyle), [
            wikiKindIcons[article.kind]({ mode: "duotone", size: "lg" }),
          ]),
        onSome: (src) =>
          h.img(
            styledAttributes(
              [h.Src(src), h.Alt(name), h.Attribute("loading", "lazy")],
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
          children: [kindLabel(article, translatorFor(config.language))],
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
      Option.map(
        bookmarkLabel(
          { article, maybeBookmarkState: config.maybeBookmarkState ?? Option.none() },
          translatorFor(config.language),
        ),
        (label) =>
          h.span(styledAttributes([h.Title(label), h.AriaLabel(label)], cardBookmarkStyle), [
            Icons.bookmarkCheck({ size: "md", mode: "duotone" }),
          ]),
      ),
    ),
  ])
}

const skeletonPanelStyle = Style.make({ rowGap: space[2], justifyItems: "stretch" })

/** An article card on its way: the color block where its photo goes, and the names' panel. */
export const skeleton = <Message>(h: HtmlBuilder<Message>): Html =>
  h.div(styledAttributes([], cardStyle), [
    h.div(styledAttributes([], cardMediaStyle)),
    h.div(styledAttributes([], cardPanelStyle, skeletonPanelStyle), [
      LoadingState.bone(
        { shape: "pill", styles: [Style.make({ inlineSize: "3.5rem", blockSize: "1rem" })] },
        h,
      ),
      LoadingState.bone({ shape: "heading", styles: [Style.make({ inlineSize: "80%" })] }, h),
      LoadingState.bone({ shape: "shortLine" }, h),
    ]),
  ])
