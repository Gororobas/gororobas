import type { SupportedLanguage } from "@gororobas/domain/common/enums"
import type { BookmarkState } from "@gororobas/domain/common/enums"
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
import { styledAttributes } from "../pleat-attributes"
import { focusRingDeclarations } from "../styles/focus-ring"
import { duration, fontWeight, radius, space, tones } from "../theme"
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

const textStyle = Style.make({ display: "grid", flex: 1, minInlineSize: 0 })
const nameStyle = Style.make({ color: tones.neutral.shade[700] })
const bookmarkStyle = Style.make({ color: tones.neutral.shade[600] })

export type WikiArticleRowConfig = Readonly<{
  language: SupportedLanguage
  article: WikiArticleQueriedCardData
  /** Subtitles and similar details shown under the name, such as an author. */
  maybeSubtitle?: Option.Option<string>
  maybeBookmarkState?: Option.Option<BookmarkState>
}>

/** A linked line for one article: thumbnail, kind, name and scientific name. */
export const view = <Message>(config: WikiArticleRowConfig, h: HtmlBuilder<Message>): Html => {
  const { article } = config
  const name = primaryName(article)
  const subtitle = Option.orElse(config.maybeSubtitle ?? Option.none(), () =>
    EffectArray.head(article.scientificNames),
  )

  return h.a(styledAttributes([h.Href(wikiArticleUrl(config.language, article))], rowStyle), [
    Thumbnail.view({ maybeSrc: articleThumbnailUrl(article), alt: name }, h),
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
      Option.map(
        bookmarkLabel(
          { article, maybeBookmarkState: config.maybeBookmarkState ?? Option.none() },
          translatorFor(config.language),
        ),
        (label) =>
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
    Thumbnail.view({ maybeSrc: articleThumbnailUrl(article), alt: "", size: "xs" }, h),
    AppText.view(
      { element: "span", appearance: "footnote", styles: [chipNameStyle], children: [name] },
      h,
    ),
  ])
}
