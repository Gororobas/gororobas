import type { BookmarkState } from "@gororobas/domain/common/enums"
import type { WikiArticleQueriedCardData } from "@gororobas/domain/wiki/domain"
import { Style, When } from "@pleat/core"
import { Array as EffectArray, Option } from "effect"
import type { Html, HtmlBuilder } from "foldkit/html"

import { wikiArticleUrl } from "../../app/route"
import { bookmarkLabels, plantBookmarkLabels, wikiKindLabels } from "../../lib/vocabulary"
import { ofName, primaryName } from "../../lib/wiki-article-names"
import { AppText } from "../app-text"
import * as Icons from "../icons"
import { styledAttributes } from "../pleat-attributes"
import { focusRingDeclarations } from "../styles/focus-ring"
import { duration, fontWeight, radius, space, toneColors, tones, toneStyle } from "../theme"
import { Thumbnail } from "../thumbnail"

const rowStyle = Style.make({
  display: "flex",
  alignItems: "center",
  gap: space[4],
  padding: space[1],
  borderRadius: radius.md,
  color: tones.neutral.ramp[700],
  outline: "none",
}).pipe(Style.when(When.focusVisible, focusRingDeclarations))

/** Results grids show each article as its own card, in the garden's sage green. */
const cardStyle = Style.make({
  blockSize: "100%",
  padding: space[3],
  borderRadius: radius.lg,
  backgroundColor: toneColors.background,
  transition: `transform ${duration.fast}, background-color ${duration.fast}`,
}).pipe(
  Style.when(When.hover, {
    transform: "translateY(-0.125rem)",
    backgroundColor: toneColors.backgroundMuted,
  }),
)

const cardKindStyle = Style.make({ color: toneColors.emphasis, fontWeight: fontWeight.semibold })
const cardNameStyle = Style.make({ color: tones.secondary.emphasis })

const textStyle = Style.make({ display: "grid", flex: 1, minInlineSize: 0 })
const nameStyle = Style.make({ color: tones.neutral.ramp[700] })
const bookmarkStyle = Style.make({ color: tones.neutral.ramp[600] })

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

/** A linked line for one article: thumbnail, kind, name and scientific name. */
export const view = <Message>(config: WikiArticleRowConfig, h: HtmlBuilder<Message>): Html => {
  const { article } = config
  const isCard = config.isCard === true
  const name = primaryName(article)
  const subtitle = Option.orElse(config.maybeSubtitle ?? Option.none(), () =>
    EffectArray.head(article.scientificNames),
  )
  const bookmarkLabel = Option.map(config.maybeBookmarkState ?? Option.none(), (state) =>
    article.kind === "PLANT" ? plantBookmarkLabels[state] : bookmarkLabels[state],
  )

  return h.a(
    styledAttributes(
      [h.Href(wikiArticleUrl(article))],
      rowStyle,
      ...(isCard ? [toneStyle("accent"), cardStyle] : []),
    ),
    [
      Thumbnail.view({ maybeMediaAssetId: article.thumbnailMediaAssetId, alt: name }, h),
      h.div(styledAttributes([], textStyle), [
        AppText.view(
          {
            appearance: "caption",
            isMuted: !isCard,
            styles: isCard ? [cardKindStyle] : [],
            children: [kindLabel(article)],
          },
          h,
        ),
        AppText.view(
          {
            element: "span",
            appearance: "large",
            weight: "semibold",
            lineHeight: "tight",
            styles: [isCard ? cardNameStyle : nameStyle],
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
        Option.map(bookmarkLabel, (label) =>
          h.span(styledAttributes([h.Title(label), h.AriaLabel(label)], bookmarkStyle), [
            Icons.bookmarkCheck({ size: "md" }),
          ]),
        ),
      ),
    ],
  )
}
