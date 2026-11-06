import type { SupportedLanguage } from "@gororobas/domain/common/enums"
import type { ProfileCardData } from "@gororobas/domain/profiles/domain"
import { Style, When } from "@pleat/core"
import { Option } from "effect"
import type { Html, HtmlBuilder } from "foldkit/html"

import { profileUrl } from "../../app/route"
import { imageUrl } from "../../media-urls"
import { AppText } from "../app-text"
import { styledAttributes } from "../pleat-attributes"
import { profileAvatar, type ProfileAvatarSize } from "../profile-avatar/view"
import { focusRingDeclarations } from "../styles/focus-ring"
import { radius, space, tones } from "../theme"

const rowStyle = Style.make({
  display: "flex",
  alignItems: "center",
  gap: space[3],
  borderRadius: radius.md,
  color: "inherit",
  outline: "none",
}).pipe(
  Style.when(When.hover, { color: tones.accent.shade[800] }),
  Style.when(When.focusVisible, focusRingDeclarations),
)

const textStyle = Style.make({ display: "grid", minInlineSize: 0 })
const nameStyle = Style.make({ color: tones.neutral.shade[700] })

const nameAppearances = { compact: "footnote", standard: "regular", large: "xl" } as const
const detailAppearances = { compact: "caption", standard: "footnote", large: "regular" } as const

export type ProfileRowConfig = Readonly<{
  profile: ProfileCardData
  language: SupportedLanguage
  size?: Extract<ProfileAvatarSize, "compact" | "standard" | "large">
  /** Details beside the name, such as how many edits the person made. */
  trailing?: ReadonlyArray<Html>
}>

/** A person or organization: avatar, name and location, leading to their profile. */
export const view = <Message>(config: ProfileRowConfig, h: HtmlBuilder<Message>): Html => {
  const { profile } = config
  const size = config.size ?? "standard"

  return h.a(
    styledAttributes([h.Href(profileUrl(config.language, { handle: profile.handle }))], rowStyle),
    [
      profileAvatar(
        {
          name: profile.name,
          maybePhotoUrl: Option.map(Option.fromNullishOr(profile.photoId), (id) =>
            imageUrl(id, 300),
          ),
          size,
        },
        h,
      ),
      h.div(styledAttributes([], textStyle, Style.make({ flex: 1 })), [
        AppText.view(
          {
            element: "span",
            appearance: nameAppearances[size],
            weight: "semibold",
            lineHeight: "tight",
            styles: [nameStyle],
            children: [profile.name],
          },
          h,
        ),
        ...(profile.location === null
          ? []
          : [
              AppText.view(
                {
                  element: "span",
                  appearance: detailAppearances[size],
                  children: [profile.location.text],
                },
                h,
              ),
            ]),
      ]),
      ...(config.trailing ?? []),
    ],
  )
}
