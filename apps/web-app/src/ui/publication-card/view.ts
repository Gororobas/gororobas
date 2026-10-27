import type { ApiPublicationCardData } from "@gororobas/domain/publications/domain"
import { tiptapToText } from "@gororobas/domain/rich-text/tiptap-to-text"
import { Color, Style, When } from "@pleat/core"
import { Array as EffectArray, DateTime, Option } from "effect"
import type { Html, HtmlBuilder } from "foldkit/html"

import { wikiArticleUrl } from "../../app/route"
import { formatFullDate, formatRelativeDate } from "../../lib/relative-dates"
import { primaryName } from "../../lib/wiki-article-names"
import { audioUrl, imageUrl } from "../../media-urls"
import { AppText, type AppTextAppearance } from "../app-text"
import { styledAttributes } from "../pleat-attributes"
import { ProfileRow } from "../profile-row"
import { focusRingDeclarations } from "../styles/focus-ring"
import {
  borderWidth,
  fontSize,
  fontWeight,
  lineHeight,
  radius,
  space,
  toneColors,
  tones,
  toneStyle,
} from "../theme"

// Ported from live-draft-solid's publication card.

const rowStyle = Style.make({ display: "flex", alignItems: "center", gap: space[3] })

const tagsRowStyle = Style.make({
  display: "flex",
  minInlineSize: 0,
  flex: 1,
  gap: space[2],
  overflowX: "auto",
  overscrollBehaviorInline: "contain",
  paddingBlockEnd: space[1],
  scrollbarWidth: "none",
})

const tagStyle = Style.make({
  flexShrink: 0,
  border: `${borderWidth.hairline} dashed ${toneColors.borderStrong}`,
  borderRadius: radius.full,
  cornerShape: "squircle",
  backgroundColor: toneColors.background,
  paddingBlock: space[1],
  paddingInline: space[3],
  color: toneColors.foregroundMuted,
  fontSize: fontSize.footnote,
  fontWeight: fontWeight.medium,
  lineHeight: lineHeight.tight,
  outline: "none",
}).pipe(Style.when(When.focusVisible, focusRingDeclarations))

const cardCopyStyle = Style.make({
  marginBlockStart: space[3],
  display: "-webkit-box",
  overflow: "hidden",
  WebkitBoxOrient: "vertical",
  WebkitLineClamp: "3",
  whiteSpace: "pre-line",
  color: toneColors.foreground,
})

const mediaStyle = Style.make({
  display: "grid",
  rowGap: space[2],
  marginBlockStart: space[4],
})

const imageStyle = Style.make({
  inlineSize: "100%",
  maxBlockSize: "20rem",
  objectFit: "cover",
  borderRadius: radius.lg,
})

const footerStyle = Style.make({
  display: "flex",
  alignItems: "center",
  gap: space[2],
  marginBlockStart: space[4],
  borderBlockStart: `${borderWidth.hairline} dashed ${toneColors.border}`,
  paddingBlockStart: space[3],
})

// Publication cards read like recipe cards pinned to the page: a lighter lip along the top,
// a warm wash under it and squircle corners.
const cardStyle = Style.make({
  position: "relative",
  display: "block",
  borderWidth: borderWidth.thick,
  borderStyle: "solid",
  borderColor: tones.secondary.background,
  borderBlockStartColor: tones.secondary.ramp[400],
  borderRadius: space[7],
  cornerShape: "squircle",
  backgroundColor: tones.secondary.backgroundCard,
  backgroundImage: `linear-gradient(to bottom, ${Color.alpha(tones.secondary.background, 0.55)}, transparent ${space[10]})`,
  paddingInline: space[5],
  paddingBlockStart: space[5],
  paddingBlockEnd: space[4],
  color: tones.secondary.foreground,
}).pipe(Style.merge(toneStyle("secondary")))

/** Short posts read larger, like a note; longer ones settle into body text. */
const SHORT_POST_LENGTH = 180
const copyAppearance = (content: string): AppTextAppearance =>
  content.trim().length <= SHORT_POST_LENGTH ? "large" : "regular"

export type PublicationCardConfig = Readonly<{
  publication: ApiPublicationCardData
  /** Dates read relative to it; without it, cards show the full date. */
  maybeToday: Option.Option<DateTime.Utc>
}>

/** A post or event as it appears in lists: when, its themes, an excerpt, its first media, and who wrote it. */
export const view = <Message>(
  { publication, maybeToday }: PublicationCardConfig,
  h: HtmlBuilder<Message>,
): Html => {
  const content = tiptapToText(publication.content)
  const maybeAudio = EffectArray.findFirst(
    publication.mediaAssets,
    (media) => media.format === "AUDIO",
  )
  const maybeImage = EffectArray.findFirst(
    publication.mediaAssets,
    (media) => media.format === "IMAGE",
  )
  const maybePublishedAt = Option.fromNullishOr(publication.publishedAt)

  return h.article(styledAttributes([], cardStyle), [
    h.div(styledAttributes([], rowStyle), [
      AppText.view(
        {
          element: "p",
          appearance: "footnote",
          tone: "neutral",
          isMuted: true,
          weight: "medium",
          styles: [Style.make({ flexShrink: 0 })],
          attributes: EffectArray.fromOption(
            Option.map(maybePublishedAt, (date) => h.Title(formatFullDate(date))),
          ),
          children: [
            Option.match(maybePublishedAt, {
              onNone: () => "Rascunho",
              onSome: (date) =>
                Option.match(maybeToday, {
                  onNone: () => formatFullDate(date),
                  onSome: (today) => formatRelativeDate(date, today),
                }),
            }),
          ],
        },
        h,
      ),
      h.div(
        styledAttributes([h.AriaLabel("Temas")], tagsRowStyle),
        publication.concepts.map((concept) =>
          h.keyed("a")(concept.id, styledAttributes([h.Href(wikiArticleUrl(concept))], tagStyle), [
            primaryName(concept),
          ]),
        ),
      ),
    ]),
    AppText.view(
      {
        element: "p",
        appearance: copyAppearance(content),
        lineHeight: "normal",
        styles: [cardCopyStyle],
        children: [content],
      },
      h,
    ),
    ...EffectArray.match(
      [...EffectArray.fromOption(maybeAudio), ...EffectArray.fromOption(maybeImage)],
      {
        onEmpty: () => [],
        onNonEmpty: (media) => [
          h.div(
            styledAttributes([], mediaStyle),
            media.map((item) =>
              item.format === "AUDIO"
                ? h.audio([
                    h.Src(audioUrl(item.id)),
                    h.Attribute("controls", ""),
                    h.Attribute("preload", "none"),
                  ])
                : h.img(
                    styledAttributes(
                      [h.Src(imageUrl(item.id, 1280)), h.Alt(""), h.Attribute("loading", "lazy")],
                      imageStyle,
                    ),
                  ),
            ),
          ),
        ],
      },
    ),
    h.footer(styledAttributes([], footerStyle), [
      ProfileRow.view({ profile: publication.owner, size: "compact" }, h),
    ]),
  ])
}
