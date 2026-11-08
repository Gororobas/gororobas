import type { SupportedLanguage } from "@gororobas/domain/common/enums"
import { msg } from "@lingui/core/macro"
import { Style, When } from "@pleat/core"
import { Option } from "effect"
import type { Html, HtmlBuilder } from "foldkit/html"

import { translatorFor } from "../../lib/translations"
import { AppText } from "../app-text"
import * as Icons from "../icons"
import { styledAttributes } from "../pleat-attributes"
import { profileAvatar } from "../profile-avatar/view"
import { focusRingDeclarations } from "../styles/focus-ring"
import { borderWidth, breakpoint, radius, space, tones } from "../theme"

const triggerStyle = Style.make({
  display: "flex",
  alignItems: "center",
  gap: space[3],
  border: 0,
  borderRadius: radius.md,
  padding: 0,
  backgroundColor: "transparent",
  color: "inherit",
  textAlign: "start",
  cursor: "help",
  outline: "none",
}).pipe(
  Style.when(When.hover, { color: tones.accent.shade[800] }),
  Style.when(When.focusVisible, focusRingDeclarations),
)

const nameStyle = Style.make({ color: tones.neutral.shade[700] })

const iconStyle = Style.make({ opacity: 0.7 })

/** Wide screens with a precise pointer show it by its trigger, like `PopoverDrawer` does. */
const precisePointer = When.all(breakpoint.md, When.media("(hover: hover) and (pointer: fine)"))

// NOTE: A native popover opens on tap and keyboard alike and closes on outside clicks and Escape,
// without a model for every card. `interestfor` opens it on hover too, where supported. Phones and
// touch screens get it as a bottom drawer; wide screens by its trigger, with anchor positioning.
// No `display` here: it would override the browser's hiding of closed popovers.
const panelStyle = Style.make({
  inset: "auto 0 0 0",
  margin: 0,
  inlineSize: "100%",
  maxInlineSize: "none",
  padding: space[5],
  border: `${borderWidth.hairline} solid ${tones.secondary.shade[300]}`,
  borderStartStartRadius: radius.lg,
  borderStartEndRadius: radius.lg,
  backgroundColor: tones.secondary.backgroundCard,
  color: tones.neutral.shade[800],
}).pipe(
  Style.when(precisePointer, {
    inset: "auto",
    marginBlock: space[2],
    inlineSize: "auto",
    maxInlineSize: "min(22rem, calc(100vw - 2rem))",
    padding: space[4],
    borderRadius: radius.md,
    positionArea: "block-start span-inline-end",
    positionTryFallbacks: "flip-block, flip-inline",
  }),
)

const panelContentStyle = Style.make({ display: "grid", rowGap: space[2] })

export type MysteriousAuthorConfig = Readonly<{
  /** Unique within the page: it names the explainer and anchors it to its trigger. */
  id: string
  language: SupportedLanguage
}>

/**
 * Who wrote a publication, when the reader may not see their profile: a playful stand-in, and an
 * explainer of why there's no name.
 */
export const view = <Message>(
  { id, language }: MysteriousAuthorConfig,
  h: HtmlBuilder<Message>,
): Html => {
  const i18n = translatorFor(language)
  const name = i18n._(msg`Mysterious author`)
  const anchor = `--${id}`

  return h.span(
    [],
    [
      h.button(
        styledAttributes(
          [
            h.Type("button"),
            h.Attribute("popovertarget", id),
            h.Attribute("interestfor", id),
            h.AriaDescription(i18n._(msg`Why don't we know who wrote this?`)),
          ],
          triggerStyle,
          Style.make({ anchorName: anchor }),
        ),
        [
          profileAvatar({ name, maybePhotoUrl: Option.none(), size: "compact" }, h),
          AppText.view(
            {
              element: "span",
              appearance: "footnote",
              weight: "semibold",
              lineHeight: "tight",
              styles: [nameStyle],
              children: [name],
            },
            h,
          ),
          Icons.infoCircle({ size: "sm", mode: "duotone", styles: [iconStyle] }),
        ],
      ),
      h.div(
        styledAttributes(
          [h.Id(id), h.Attribute("popover", "auto")],
          panelStyle,
          Style.make({ positionAnchor: anchor }),
        ),
        [
          h.div(styledAttributes([], panelContentStyle), [
            AppText.view(
              { element: "p", appearance: "regular", weight: "semibold", children: [name] },
              h,
            ),
            AppText.view(
              {
                element: "p",
                appearance: "footnote",
                children: [
                  i18n._(
                    msg`Whoever wrote this shares their profile only with the Gororobas community, so their name stays a secret here. What they published is for everyone, though.`,
                  ),
                ],
              },
              h,
            ),
          ]),
        ],
      ),
    ],
  )
}
