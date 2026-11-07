import type { CreditedMediaAssetRow, CreditedProfile } from "@gororobas/domain/media-assets/domain"
import { msg, plural } from "@lingui/core/macro"
import { Color, Recipe, Style, When } from "@pleat/core"
import { Array as EffectArray, Option } from "effect"
import type { Html, HtmlBuilder } from "foldkit/html"

import type { Translator } from "../../lib/translations"
import { imageUrl } from "../../media-urls"
import { AppText } from "../app-text"
import * as Icons from "../icons"
import { styledAttributes, styledClassName } from "../pleat-attributes"
import type { ViewInputs as PopoverDrawerViewInputs } from "../popover-drawer"
import { profileAvatar } from "../profile-avatar/view"
import { focusRingDeclarations } from "../styles/focus-ring"
import {
  blur,
  borderWidth,
  duration,
  fontSize,
  fontWeight,
  radius,
  space,
  toneColors,
  tones,
} from "../theme"
import { licenseName } from "./licenses"

/** One person or source to credit: a profile in the app, or a line of text with an optional link. */
export type MediaCredit = Readonly<{
  maybeProfile: Option.Option<CreditedProfile>
  maybeLine: Option.Option<string>
  maybeUrl: Option.Option<string>
}>

/** Who to credit for media, the terms it's shared under and where it was published. */
export type MediaAttribution = Readonly<{
  credits: ReadonlyArray<MediaCredit>
  /** The license a provider's media is shared under. */
  maybeLicenseUrl: Option.Option<string>
  /** The provider's page for the media, such as a GBIF occurrence. */
  maybeSourceUrl: Option.Option<string>
}>

export type MediaDimensions = Readonly<{ width: number; height: number }>

/** Who to credit for media uploaded here: the people and lines its uploader named. */
export const uploadedMediaAttribution = (media: CreditedMediaAssetRow): MediaAttribution => ({
  credits: media.credits.map((credit) => ({
    maybeProfile: Option.fromNullishOr(credit.profile),
    maybeLine: Option.fromNullishOr(credit.creditLine),
    maybeUrl: Option.fromNullishOr(credit.creditUrl),
  })),
  maybeLicenseUrl: Option.none(),
  maybeSourceUrl: Option.none(),
})

/** Whether there's anything to credit: media without credits or a license shows no badge. */
export const hasCredits = (attribution: MediaAttribution): boolean =>
  EffectArray.isReadonlyArrayNonEmpty(attribution.credits) ||
  Option.isSome(attribution.maybeLicenseUrl)

const creditName = (credit: MediaCredit): string =>
  Option.match(credit.maybeProfile, {
    onSome: (profile) => profile.name,
    onNone: () => Option.getOrElse(credit.maybeLine, () => ""),
  })

/**
 * Pins the badge to a corner of its photo. It positions a wrapper rather than the badge itself:
 * popovers lift their open trigger above their backdrop with an inline `position: relative`, which
 * would pull an absolutely positioned badge out of its corner.
 */
export const cornerStyle = Recipe.make({
  name: "MediaCreditCorner",
  // A grid track that can shrink, so long credits truncate within the photo instead of overflowing
  // through the popover's wrappers.
  base: Style.make({
    position: "absolute",
    display: "grid",
    gridTemplateColumns: "minmax(0, auto)",
    maxInlineSize: `calc(100% - 2 * ${space[2]})`,
  }),
  variants: {
    corner: {
      bottomStart: { insetInlineStart: space[2], insetBlockEnd: space[2] },
      /** Clear of a caption along the photo's lower edge. */
      topEnd: { insetInlineEnd: space[2], insetBlockStart: space[2] },
    },
  },
  defaults: { corner: "bottomStart" },
})

/** Legible on any image. */
export const badgeStyle = Style.make({
  display: "inline-flex",
  alignItems: "center",
  gap: space[1],
  maxInlineSize: "100%",
  paddingBlock: space[1],
  paddingInline: space[2],
  border: "none",
  borderRadius: radius.full,
  cornerShape: "squircle",
  // Over photos, so the same in light and dark modes.
  backgroundColor: Color.alpha(tones.neutral.ramp[900], 0.62),
  backdropFilter: blur.chrome,
  color: tones.neutral.ramp[50],
  fontSize: fontSize.caption,
  fontWeight: fontWeight.medium,
  cursor: "pointer",
  outline: "none",
  transitionProperty: "background-color",
  transitionDuration: duration.control,
}).pipe(
  Style.when(When.hover, { backgroundColor: Color.alpha(tones.neutral.ramp[900], 0.8) }),
  Style.when(When.focusVisible, focusRingDeclarations),
)

const badgeLabelStyle = Style.make({
  minInlineSize: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
})

/** "📷 Ana +2": the first person credited, and how many more there are. */
export const badgeChildren = <Message>(
  { attribution, i18n }: Readonly<{ attribution: MediaAttribution; i18n: Translator }>,
  h: HtmlBuilder<Message>,
): ReadonlyArray<Html> => [
  Icons.camera({ size: "sm" }),
  ...EffectArray.match(attribution.credits, {
    onEmpty: () => [h.span(styledAttributes([], badgeLabelStyle), [i18n._(msg`Credits`)])],
    onNonEmpty: ([first, ...others]) => [
      h.span(styledAttributes([], badgeLabelStyle), [creditName(first)]),
      ...(EffectArray.isReadonlyArrayNonEmpty(others) ? [h.span([], [`+${others.length}`])] : []),
    ],
  }),
]

/** "Photo by Ana, license CC BY 4.0", for assistive technology. */
export const badgeLabel = ({
  attribution,
  i18n,
}: Readonly<{ attribution: MediaAttribution; i18n: Translator }>): string =>
  [
    EffectArray.match(attribution.credits, {
      onEmpty: () => i18n._(msg`Photo credits`),
      onNonEmpty: (credits) => {
        const names = credits.map(creditName).join(", ")
        return i18n._(msg`Photo by ${names}`)
      },
    }),
    ...EffectArray.fromOption(
      Option.map(attribution.maybeLicenseUrl, (url) => {
        const license = licenseName(url, i18n)
        return i18n._(msg`license ${license}`)
      }),
    ),
  ].join(", ")

const detailsStyle = Style.make({ display: "grid", rowGap: space[4] })
const sectionStyle = Style.make({ display: "grid", rowGap: space[2] })
const sectionTitleStyle = Style.make({ color: tones.neutral.shade[700] })
const creditListStyle = Style.make({ display: "grid", rowGap: space[2] })
const personStyle = Style.make({ display: "flex", alignItems: "center", gap: space[2] })

const linkStyle = Style.make({
  display: "inline-flex",
  alignItems: "center",
  gap: space[1],
  color: tones.accent.shade[800],
  fontWeight: fontWeight.semibold,
  textDecorationLine: "underline",
  textDecorationColor: tones.accent.shade[300],
  textUnderlineOffset: "0.2em",
  borderRadius: radius.sm,
  outline: "none",
}).pipe(
  Style.when(When.hover, { textDecorationColor: tones.accent.shade[700] }),
  Style.when(When.focusVisible, focusRingDeclarations),
)

const licenseStyle = Style.make({
  display: "inline-flex",
  alignItems: "center",
  justifySelf: "start",
  gap: space[2],
  paddingBlock: space[1],
  paddingInline: space[3],
  border: `${borderWidth.hairline} solid ${toneColors.border}`,
  borderRadius: radius.full,
  cornerShape: "squircle",
  color: tones.neutral.shade[900],
  fontWeight: fontWeight.semibold,
  outline: "none",
}).pipe(
  Style.when(When.hover, { backgroundColor: toneColors.hover }),
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
        AppText.view({ element: "span", weight: "medium", children: [profile.name] }, h),
      ]),
    onNone: () => {
      const line = Option.getOrElse(entry.maybeLine, () => "")

      return Option.match(entry.maybeUrl, {
        onNone: () => AppText.view({ element: "span", weight: "medium", children: [line] }, h),
        onSome: (url) => h.a(styledAttributes(externalLinkAttributes(url, h), linkStyle), [line]),
      })
    },
  })

const section = <Message>(
  { title, children }: Readonly<{ title: string; children: ReadonlyArray<Html> }>,
  h: HtmlBuilder<Message>,
): Html =>
  h.div(styledAttributes([], sectionStyle), [
    AppText.view(
      {
        element: "h3",
        appearance: "footnote",
        weight: "semibold",
        styles: [sectionTitleStyle],
        children: [title],
      },
      h,
    ),
    ...children,
  ])

/** Everything readers need to credit a photo, inside its popover or drawer. */
export const details = <Message>(
  { attribution, i18n }: Readonly<{ attribution: MediaAttribution; i18n: Translator }>,
  h: HtmlBuilder<Message>,
): Html =>
  h.div(styledAttributes([], detailsStyle), [
    ...EffectArray.match(attribution.credits, {
      onEmpty: () => [],
      onNonEmpty: (credits) => [
        section(
          {
            title: i18n._(msg`${plural(credits.length, { one: "Author", other: "Authors" })}`),
            children: [
              h.div(
                styledAttributes([], creditListStyle),
                credits.map((entry) => credit(entry, h)),
              ),
            ],
          },
          h,
        ),
      ],
    }),
    ...EffectArray.fromOption(
      Option.map(attribution.maybeLicenseUrl, (url) =>
        section(
          {
            title: i18n._(msg`License`),
            children: [
              h.a(styledAttributes(externalLinkAttributes(url, h), licenseStyle), [
                Icons.copyright({ size: "sm" }),
                licenseName(url, i18n),
                Icons.arrowRight({ size: "sm" }),
              ]),
            ],
          },
          h,
        ),
      ),
    ),
    ...EffectArray.fromOption(
      Option.map(attribution.maybeSourceUrl, (url) =>
        h.a(styledAttributes(externalLinkAttributes(url, h), linkStyle), [
          i18n._(msg`See the original post`),
          Icons.arrowRight({ size: "sm" }),
        ]),
      ),
    ),
  ])

const panelStyle = Style.make({ inlineSize: "min(20rem, calc(100vw - 2rem))" })

/**
 * What a `PopoverDrawer` needs to credit a photo: a badge that opens the details, in a popover by
 * the badge or a drawer on touch screens. Render it inside `corner` to pin it to the photo.
 */
export const popoverDrawerInputs = <Message>(
  {
    attribution,
    i18n,
    corner = "bottomStart",
  }: Readonly<{
    attribution: MediaAttribution
    i18n: Translator
    corner?: "bottomStart" | "topEnd"
  }>,
  h: HtmlBuilder<Message>,
): PopoverDrawerViewInputs => ({
  title: i18n._(msg`Photo credits`),
  trigger: {
    children: badgeChildren({ attribution, i18n }, h),
    className: styledClassName(badgeStyle),
    ariaLabel: badgeLabel({ attribution, i18n }),
  },
  toContent: () => [details({ attribution, i18n }, h)],
  anchor: { placement: corner === "bottomStart" ? "top-start" : "bottom-end", gap: 6, padding: 8 },
  panelClassName: styledClassName(panelStyle),
  tone: "primary",
})

/** Pins a credit badge, such as a `PopoverDrawer` built from `popoverDrawerInputs`, to a corner. */
export const corner = <Message>(
  { corner = "bottomStart", badge }: Readonly<{ corner?: "bottomStart" | "topEnd"; badge: Html }>,
  h: HtmlBuilder<Message>,
): Html => h.div(styledAttributes([], cornerStyle({ corner })), [badge])
