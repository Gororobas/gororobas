import type { CreditedProfile } from "@gororobas/domain/media-assets/domain"
import { Style, When } from "@pleat/core"
import { Array as EffectArray, Option } from "effect"
import type { Html, HtmlBuilder } from "foldkit/html"

import { imageUrl } from "../../media-urls"
import { AppText } from "../app-text"
import { styledAttributes } from "../pleat-attributes"
import { profileAvatar } from "../profile-avatar/view"
import { focusRingDeclarations } from "../styles/focus-ring"
import { radius, space, tones } from "../theme"

/** One person or source to credit: a profile in the app, or a line of text with an optional link. */
export type MediaCredit = Readonly<{
  maybeProfile: Option.Option<CreditedProfile>
  maybeLine: Option.Option<string>
  maybeUrl: Option.Option<string>
}>

export type MediaCreditConfig = Readonly<{
  credits: ReadonlyArray<MediaCredit>
  /** The license a provider's photo is shared under. */
  maybeLicenseUrl?: Option.Option<string>
  /** Small type for captions over photos; regular beside a photo. */
  appearance?: "caption" | "footnote"
}>

const creditStyle = Style.make({
  display: "inline-flex",
  flexWrap: "wrap",
  alignItems: "center",
  columnGap: space[1],
  rowGap: space[1],
  color: tones.neutral.shade[700],
})

const personStyle = Style.make({ display: "inline-flex", alignItems: "center", gap: space[1] })
const listedStyle = Style.make({ display: "inline-flex", alignItems: "center" })
const nameStyle = Style.make({ color: tones.neutral.shade[900] })

const linkStyle = Style.make({
  color: "inherit",
  textDecorationLine: "underline",
  textDecorationColor: tones.neutral.shade[300],
  textUnderlineOffset: "0.2em",
  borderRadius: radius.sm,
  outline: "none",
}).pipe(
  Style.when(When.hover, { textDecorationColor: tones.neutral.shade[700] }),
  Style.when(When.focusVisible, focusRingDeclarations),
)

const externalLinkAttributes = <Message>(href: string, h: HtmlBuilder<Message>) => [
  h.Href(href),
  h.Attribute("target", "_blank"),
  h.Attribute("rel", "noopener noreferrer"),
]

const credit = <Message>(entry: MediaCredit, h: HtmlBuilder<Message>): Html =>
  Option.match(entry.maybeProfile, {
    onSome: (profile) =>
      h.span(styledAttributes([], personStyle), [
        profileAvatar(
          {
            name: profile.name,
            maybePhotoUrl: Option.map(Option.fromNullishOr(profile.photoId), (id) =>
              imageUrl(id, 50),
            ),
            size: "inline",
          },
          h,
        ),
        h.span(styledAttributes([], nameStyle), [profile.name]),
      ]),
    onNone: () => {
      const line = Option.getOrElse(entry.maybeLine, () => "")

      return Option.match(entry.maybeUrl, {
        onNone: () => h.span(styledAttributes([], nameStyle), [line]),
        onSome: (url) => h.a(styledAttributes(externalLinkAttributes(url, h), linkStyle), [line]),
      })
    },
  })

/** "Por Ana, João · licença": who took a photo, as people in the app wherever possible. */
export const view = <Message>(config: MediaCreditConfig, h: HtmlBuilder<Message>): Html =>
  AppText.view(
    {
      element: "span",
      appearance: config.appearance ?? "footnote",
      styles: [creditStyle],
      children: [
        ...EffectArray.match(config.credits, {
          onEmpty: () => [],
          onNonEmpty: (credits) => [
            "Por",
            // The comma stays with the name before it, where the flex gap can't push it away.
            ...credits.map((entry, index) =>
              index === credits.length - 1
                ? credit(entry, h)
                : h.span(styledAttributes([], listedStyle), [credit(entry, h), ","]),
            ),
          ],
        }),
        ...EffectArray.fromOption(
          Option.map(config.maybeLicenseUrl ?? Option.none(), (url) =>
            h.a(styledAttributes(externalLinkAttributes(url, h), linkStyle), ["licença"]),
          ),
        ),
      ],
    },
    h,
  )
