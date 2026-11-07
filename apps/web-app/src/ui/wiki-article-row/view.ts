import type { SupportedLanguage } from "@gororobas/domain/common/enums"
import type { BookmarkState } from "@gororobas/domain/common/enums"
import type { WikiArticleQueriedCardData } from "@gororobas/domain/wiki/domain"
import { msg, select } from "@lingui/core/macro"
import { Style, When } from "@pleat/core"
import { Array as EffectArray, Option } from "effect"
import type { Html, HtmlBuilder } from "foldkit/html"

import { wikiArticleUrl } from "../../app/route"
import { type Translator, translatorFor } from "../../lib/translations"
import { bookmarkVocabularies, wikiKindLabels } from "../../lib/vocabulary"
import { nameParts, primaryName } from "../../lib/wiki-article-names"
import { externalImageUrl, imageUrl } from "../../media-urls"
import { AppText } from "../app-text"
import * as Icons from "../icons"
import { iconSizeProperty } from "../icons/icon-size"
import { wikiKindIcons } from "../icons/wiki-kind-icons"
import { LoadingState } from "../loading-state"
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
  language: SupportedLanguage
  article: WikiArticleQueriedCardData
  /** Subtitles and similar details shown under the name, such as an author. */
  maybeSubtitle?: Option.Option<string>
  maybeBookmarkState?: Option.Option<BookmarkState>
  isCard?: boolean
}>

/** "Variety of Corn" when a cultivar's plant is known, otherwise the kind's name. */
const kindLabel = (article: WikiArticleQueriedCardData, i18n: Translator): string => {
  const kind = i18n._(wikiKindLabels[article.kind].singular)

  return Option.match(article.parentPlantName, {
    onNone: () => kind,
    onSome: (parentName) => {
      const { name, gender } = nameParts({ commonNames: [parentName], handle: parentName.name })
      return i18n._(msg`${select(gender, { other: `${kind} of ${name}` })}`)
    },
  })
}

const bookmarkLabel = (config: WikiArticleRowConfig, i18n: Translator): Option.Option<string> =>
  Option.map(config.maybeBookmarkState ?? Option.none(), (state) =>
    i18n._(bookmarkVocabularies[config.article.kind].states[state]),
  )

/** The article's main photo, or a provider's while it has none. */
const thumbnailSrc = (article: WikiArticleQueriedCardData): Option.Option<string> =>
  Option.orElse(
    Option.map(article.thumbnailMediaAssetId, (id) => imageUrl(id, 300)),
    () => Option.map(article.externalThumbnailUrl, (url) => externalImageUrl(url, 300)),
  )

/** One article in a results grid. Without a photo, its kind's icon stands in. */
const card = <Message>(config: WikiArticleRowConfig, h: HtmlBuilder<Message>): Html => {
  const { article } = config
  const name = primaryName(article)

  return h.a(styledAttributes([h.Href(wikiArticleUrl(config.language, article))], cardStyle), [
    h.div(styledAttributes([], cardMediaStyle), [
      Option.match(thumbnailSrc(article), {
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
      Option.map(bookmarkLabel(config, translatorFor(config.language)), (label) =>
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

  return h.a(styledAttributes([h.Href(wikiArticleUrl(config.language, article))], rowStyle), [
    Thumbnail.view({ maybeSrc: thumbnailSrc(article), alt: name }, h),
    h.div(styledAttributes([], textStyle), [
      AppText.view(
        {
          appearance: "caption",
          isMuted: true,
          children: [kindLabel(article, translatorFor(config.language))],
        },
        h,
      ),
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
      Option.map(bookmarkLabel(config, translatorFor(config.language)), (label) =>
        h.span(styledAttributes([h.Title(label), h.AriaLabel(label)], bookmarkStyle), [
          Icons.bookmarkCheck({ size: "md" }),
        ]),
      ),
    ),
  ])
}

const chipStyle = Style.make({
  display: "inline-flex",
  alignItems: "center",
  gap: space[2],
  maxInlineSize: "100%",
  paddingBlock: space[1],
  paddingInlineStart: space[1],
  paddingInlineEnd: space[3],
  borderRadius: radius.full,
  cornerShape: "squircle",
  backgroundColor: tones.primary.ramp[300],
  color: tones.neutral.ramp[900],
  fontWeight: fontWeight.medium,
  outline: "none",
  transitionProperty: "filter",
  transitionDuration: duration.control,
}).pipe(
  Style.when(When.hover, { filter: "brightness(0.96)" }),
  Style.when(When.focusVisible, focusRingDeclarations),
)

const chipNameStyle = Style.make({
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
})

/** An article in a line of others, such as what a profile saved: its photo and name. */
export const chip = <Message>(
  {
    article,
    language,
  }: Readonly<{ article: WikiArticleQueriedCardData; language: SupportedLanguage }>,
  h: HtmlBuilder<Message>,
): Html => {
  const name = primaryName(article)

  return h.a(styledAttributes([h.Href(wikiArticleUrl(language, article))], chipStyle), [
    Thumbnail.view({ maybeSrc: thumbnailSrc(article), alt: "", size: "xs" }, h),
    AppText.view(
      { element: "span", appearance: "footnote", styles: [chipNameStyle], children: [name] },
      h,
    ),
  ])
}

const skeletonPanelStyle = Style.make({ rowGap: space[2], justifyItems: "stretch" })

/** An article card on its way: the color block where its photo goes, and the names' panel. */
export const cardSkeleton = <Message>(h: HtmlBuilder<Message>): Html =>
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
