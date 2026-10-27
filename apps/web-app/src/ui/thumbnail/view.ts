import type { MediaAssetId } from "@gororobas/domain/common/ids"
import { Recipe, Style, When } from "@pleat/core"
import { Option } from "effect"
import type { Html, HtmlBuilder } from "foldkit/html"

import { imageUrl } from "../../media-urls"
import * as Icons from "../icons"
import { styledAttributes } from "../pleat-attributes"
import { tones } from "../theme"

const thumbnailStyle = Recipe.make({
  name: "Thumbnail",
  base: Style.make({
    display: "grid",
    placeItems: "center",
    flexShrink: 0,
    aspectRatio: "1",
    // A rounded square where corner-shape is unsupported, a full squircle where it is.
    borderRadius: "28%",
    cornerShape: "squircle",
    objectFit: "cover",
    backgroundColor: tones.primary.ramp[300],
    color: tones.accent.emphasis,
    overflow: "hidden",
  }).pipe(Style.when(When.supports("(corner-shape: squircle)"), { borderRadius: "50%" })),
  variants: {
    size: {
      xs: { inlineSize: "2.25rem" },
      sm: { inlineSize: "3rem" },
      md: { inlineSize: "5rem" },
      lg: { inlineSize: "7.5rem" },
    },
  },
  defaults: { size: "md" },
})

/** A square image, or a sprout when the content has none. */
export const view = <Message>(
  config: Readonly<{
    maybeMediaAssetId: Option.Option<MediaAssetId>
    alt: string
    size?: "xs" | "sm" | "md" | "lg"
  }>,
  h: HtmlBuilder<Message>,
): Html =>
  Option.match(config.maybeMediaAssetId, {
    onNone: () =>
      h.div(styledAttributes([h.AriaHidden(true)], thumbnailStyle({ size: config.size ?? "md" })), [
        Icons.sprout({ size: "lg" }),
      ]),
    onSome: (id) =>
      h.img(
        styledAttributes(
          [h.Src(imageUrl(id, 300)), h.Alt(config.alt), h.Attribute("loading", "lazy")],
          thumbnailStyle({ size: config.size ?? "md" }),
        ),
      ),
  })
