import type {
  MediaGalleryItem,
  TiptapBlockNode,
  TiptapDocument,
  TiptapInlineNode,
  TiptapListItemNode,
  TiptapMark,
} from "@gororobas/domain/rich-text/domain"
import { Style } from "@pleat/core"
import { Array as EffectArray, Function, Match, Option, Predicate } from "effect"
import type { Html, HtmlBuilder } from "foldkit/html"

import { audioUrl, imageUrl } from "../../media-urls"
import { AppText } from "../app-text"
import { styledAttributes } from "../pleat-attributes"
import { borderWidth, fontSize, lineHeight, radius, space, tones } from "../theme"

const documentStyle = Style.make({
  display: "grid",
  rowGap: space[3],
  fontSize: fontSize.regular,
  lineHeight: lineHeight.relaxed,
  color: tones.neutral.shade[900],
})

const headingStyle = Style.make({ color: tones.secondary.emphasis, lineHeight: lineHeight.tight })
const listStyle = Style.make({ display: "grid", rowGap: space[1], paddingInlineStart: space[5] })
const bulletListStyle = Style.make({ listStyle: "disc" })
const orderedListStyle = Style.make({ listStyle: "decimal" })

const quoteStyle = Style.make({
  display: "grid",
  rowGap: space[2],
  paddingInlineStart: space[4],
  borderInlineStart: `${borderWidth.thick} solid ${tones.primary.ramp[400]}`,
  color: tones.neutral.shade[700],
})

const linkStyle = Style.make({ color: tones.secondary.emphasis, textDecoration: "underline" })
const referenceStyle = Style.make({ color: tones.accent.emphasis, fontWeight: 600 })
const ruleStyle = Style.make({ borderColor: tones.primary.shade[300] })

const galleryStyle = Style.make({
  display: "flex",
  gap: space[3],
  overflowX: "auto",
  scrollSnapType: "x mandatory",
  scrollbarWidth: "thin",
  paddingBlockEnd: space[1],
})

const galleryItemStyle = Style.make({
  display: "grid",
  rowGap: space[1],
  flex: "0 0 auto",
  inlineSize: "min(18rem, 80%)",
  scrollSnapAlign: "start",
})

const galleryImageStyle = Style.make({
  inlineSize: "100%",
  aspectRatio: "4 / 3",
  objectFit: "cover",
  borderRadius: radius.md,
})

/** Article titles are the page's h1, so content headings start one level below. */
const headingElements = { 1: "h2", 2: "h3", 3: "h4" } as const
const headingAppearances = { 1: "large", 2: "large", 3: "regular" } as const

const markedText = <Message>(
  { text, marks }: Readonly<{ text: string; marks: ReadonlyArray<TiptapMark> }>,
  h: HtmlBuilder<Message>,
): Html | string =>
  EffectArray.reduce(marks, Function.identity<Html | string>(text), (inner, mark) =>
    Match.value(mark.type).pipe(
      Match.withReturnType<Html | string>(),
      Match.when("bold", () => h.strong([], [inner])),
      Match.when("italic", () => h.em([], [inner])),
      Match.when("strike", () => h.s([], [inner])),
      Match.when("code", () => h.code([], [inner])),
      Match.when("link", () => {
        const href = mark.attrs?.["href"]

        return Predicate.isString(href)
          ? h.a(
              styledAttributes(
                [h.Href(href), h.Target("_blank"), h.Rel("noopener noreferrer")],
                linkStyle,
              ),
              [inner],
            )
          : inner
      }),
      Match.exhaustive,
    ),
  )

const inline = <Message>(node: TiptapInlineNode, h: HtmlBuilder<Message>): Html | string =>
  Match.value(node).pipe(
    Match.withReturnType<Html | string>(),
    Match.discriminatorsExhaustive("type")({
      text: ({ text, marks }) => markedText({ text, marks: marks ?? [] }, h),
      hardBreak: () => h.br([]),
      entityReference: ({ attrs }) =>
        h.span(styledAttributes([], referenceStyle), [attrs.labelAtInsertion]),
    }),
  )

const inlineContent = <Message>(
  content: ReadonlyArray<TiptapInlineNode> | undefined,
  h: HtmlBuilder<Message>,
) => (content ?? []).map((node) => inline(node, h))

const galleryItem = <Message>(item: MediaGalleryItem, h: HtmlBuilder<Message>): Html => {
  const caption = Option.fromNullishOr(item.caption)

  const media = Match.value(item).pipe(
    Match.withReturnType<Html>(),
    Match.when({ source: "MEDIA_ASSET", format: "IMAGE" }, ({ mediaAssetId, alt }) =>
      h.img(
        styledAttributes(
          [
            h.Src(imageUrl(mediaAssetId, 1280)),
            h.Alt(alt ?? item.caption ?? ""),
            h.Attribute("loading", "lazy"),
          ],
          galleryImageStyle,
        ),
      ),
    ),
    Match.when({ source: "MEDIA_ASSET", format: "AUDIO" }, ({ mediaAssetId }) =>
      h.audio([
        h.Src(audioUrl(mediaAssetId)),
        h.Attribute("controls", ""),
        h.Attribute("preload", "none"),
      ]),
    ),
    Match.when({ source: "MEDIA_ASSET" }, () => h.span([], ["Vídeo"])),
    Match.when({ source: "EXTERNAL_EMBED", provider: "YOUTUBE" }, ({ providerData }) =>
      h.a(
        styledAttributes(
          [
            h.Href(`https://www.youtube.com/watch?v=${providerData.videoId}`),
            h.Target("_blank"),
            h.Rel("noopener noreferrer"),
          ],
          linkStyle,
        ),
        ["Assistir no YouTube"],
      ),
    ),
    Match.when({ source: "EXTERNAL_EMBED", provider: "SPOTIFY" }, ({ providerData }) =>
      h.a(
        styledAttributes(
          [
            h.Href(
              `https://open.spotify.com/${providerData.resourceType.toLowerCase()}/${providerData.resourceId}`,
            ),
            h.Target("_blank"),
            h.Rel("noopener noreferrer"),
          ],
          linkStyle,
        ),
        ["Ouvir no Spotify"],
      ),
    ),
    Match.exhaustive,
  )

  return h.figure(styledAttributes([], galleryItemStyle), [
    media,
    ...EffectArray.fromOption(
      Option.map(caption, (text) =>
        h.figcaption(
          [],
          [AppText.view({ element: "span", appearance: "footnote", children: [text] }, h)],
        ),
      ),
    ),
  ])
}

const listItem = <Message>(node: TiptapListItemNode, h: HtmlBuilder<Message>): Html =>
  h.li(
    [],
    node.content.map((child) => block(child, h)),
  )

const block = <Message>(node: TiptapBlockNode, h: HtmlBuilder<Message>): Html =>
  Match.value(node).pipe(
    Match.withReturnType<Html>(),
    Match.discriminatorsExhaustive("type")({
      paragraph: ({ content }) => h.p([], inlineContent(content, h)),
      heading: ({ attrs, content }) =>
        AppText.view(
          {
            element: headingElements[attrs.level],
            appearance: headingAppearances[attrs.level],
            weight: "semibold",
            styles: [headingStyle],
            children: inlineContent(content, h),
          },
          h,
        ),
      horizontalRule: () => h.hr(styledAttributes([], ruleStyle)),
      mediaGallery: ({ attrs }) =>
        h.div(
          styledAttributes([h.Role("group"), h.AriaLabel("Galeria")], galleryStyle),
          attrs.items.map((item) => galleryItem(item, h)),
        ),
      blockquote: ({ content }) =>
        h.blockquote(
          styledAttributes([], quoteStyle),
          content.map((child) => block(child, h)),
        ),
      bulletList: ({ content }) =>
        h.ul(
          styledAttributes([], listStyle, bulletListStyle),
          content.map((item) => listItem(item, h)),
        ),
      orderedList: ({ content }) =>
        h.ol(
          styledAttributes([], listStyle, orderedListStyle),
          content.map((item) => listItem(item, h)),
        ),
    }),
  )

/** Renders stored rich text with the app's typography. */
export const view = <Message>(document: TiptapDocument, h: HtmlBuilder<Message>): Html =>
  h.div(
    styledAttributes([], documentStyle),
    document.content.map((node) => block(node, h)),
  )
