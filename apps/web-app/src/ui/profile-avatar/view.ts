import { Recipe, Style } from "@pleat/core"
import { _parts, serializeVars } from "blobatar/internal"
import { Option } from "effect"
import { type Html, type HtmlBuilder } from "foldkit/html"

import { styledAttributes } from "../pleat-attributes"
import { controlSize, radius } from "../theme"

export type ProfileAvatarSize = "compact" | "standard" | "large" | "profile"

const avatarStyle = Recipe.make({
  base: {
    display: "block",
    aspectRatio: "1",
    flexShrink: 0,
    borderRadius: radius.full,
    objectFit: "cover",
  },
  variants: {
    size: {
      compact: { inlineSize: controlSize.sm },
      standard: { inlineSize: controlSize.lg },
      large: { inlineSize: "5rem" },
      profile: { inlineSize: "clamp(8rem, 10cqw, 10rem)" },
    },
  },
  defaults: { size: "standard" },
})

export const profileAvatar = <Message>(
  {
    name,
    maybePhotoUrl,
    size,
  }: Readonly<{ name: string; maybePhotoUrl: Option.Option<string>; size: ProfileAvatarSize }>,
  h: HtmlBuilder<Message>,
): Html => {
  if (Option.isSome(maybePhotoUrl)) {
    return h.img(
      styledAttributes(
        [h.Src(maybePhotoUrl.value), h.Alt(`Foto de ${name}`)],
        avatarStyle({ size }),
      ),
    )
  }

  const parts = _parts(name, { animate: "always" })

  return h.svg(
    styledAttributes(
      [
        h.Xmlns("http://www.w3.org/2000/svg"),
        h.ViewBox("0 0 100 100"),
        h.AriaLabel(`Avatar de ${name}`),
      ],
      avatarStyle({ size }),
      Style.make({ transform: "scale(1.25)" }),
    ),
    [
      h.title([], [`Avatar de ${name}`]),
      ...(parts.bg ? [h.path([h.D(parts.bg.d), h.Fill(parts.bg.fill)])] : []),
      h.g([
        h.Class(parts.cls ?? ""),
        h.Attribute("style", serializeVars(parts.vars ?? {})),
        h.InnerHTML(parts.inner),
      ]),
    ],
  )
}
