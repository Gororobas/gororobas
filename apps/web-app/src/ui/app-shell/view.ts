import { Color, Style, When } from "@pleat/core"
import { Array as EffectArray, Option } from "effect"
import type { Html, HtmlBuilder } from "foldkit/html"

import { AppButton } from "../app-button"
import { AppText } from "../app-text"
import type { IconConfig } from "../icons"
import * as Icons from "../icons"
import * as Logo from "../logo"
import { styledAttributes } from "../pleat-attributes"
import { focusRingDeclarations } from "../styles/focus-ring"
import { pageColumnStyle } from "../styles/page-column"
import { blur } from "../theme"
import {
  borderWidth,
  breakpoint,
  controlSize,
  duration,
  fontSize,
  fontWeight,
  measure,
  radius,
  space,
  toneColors,
  tones,
  viewport,
} from "../theme"

// The app bar and bottom navigation, ported from live-draft-solid's shell.

const appBarStyle = Style.make({
  borderBlockEnd: `${borderWidth.hairline} solid ${toneColors.border}`,
  backgroundColor: toneColors.backgroundCard,
})

const headerInnerStyle = Style.make({
  display: "flex",
  alignItems: "center",
  gap: space[3],
  paddingBlockStart: `calc(${space[3]} + ${viewport.safeAreaTop})`,
  paddingBlockEnd: space[3],
})

const logoLinkStyle = Style.make({
  display: "block",
  flexShrink: 0,
  borderRadius: radius.full,
  outline: "none",
}).pipe(Style.when(When.focusVisible, focusRingDeclarations))

const headerLogoStyle = Style.make({ inlineSize: space[10], blockSize: space[10] })
const spacerStyle = Style.make({ inlineSize: space[2], flexShrink: 0 }).pipe(
  Style.when(breakpoint.lg, { flexGrow: 1 }),
)
const desktopNavigationStyle = Style.make({ display: "none" }).pipe(
  Style.when(breakpoint.lg, { display: "flex", alignItems: "center", gap: space[1] }),
)

/** The search field's surface, shared by the search link and the live field. */
export const searchSurfaceStyle = Style.make({
  inlineSize: "100%",
  blockSize: controlSize.md,
  paddingInlineStart: space[10],
  paddingInlineEnd: space[4],
  border: `${borderWidth.hairline} solid ${tones.neutral.shade[200]}`,
  borderRadius: radius.full,
  cornerShape: "squircle",
  backgroundColor: tones.neutral.shade[100],
  color: toneColors.foreground,
  fontSize: fontSize.footnote,
  outline: "none",
  transitionProperty: "border-color, background-color",
  transitionDuration: duration.control,
}).pipe(
  Style.when(breakpoint.sm, { blockSize: controlSize.sm }),
  Style.when(When.hover, { borderColor: tones.neutral.shade[300] }),
  Style.when(When.focus, { backgroundColor: tones.neutral.shade[50] }),
  Style.when(When.focusVisible, focusRingDeclarations),
)

const searchLinkStyle = Style.make({
  position: "relative",
  display: "flex",
  flex: 1,
  minInlineSize: 0,
  maxInlineSize: measure.narrow,
  alignItems: "center",
  color: toneColors.foregroundMuted,
})

/** Wraps the search control so it grows on the search page, where nothing else competes. */
export const searchControlStyle = Style.make({
  position: "relative",
  display: "flex",
  flex: 1,
  minInlineSize: 0,
  maxInlineSize: measure.form,
  alignItems: "center",
})

/** Shared by the search link and the live search field, so one replaces the other in place. */
export const searchIconStyle = Style.make({
  position: "absolute",
  insetBlock: 0,
  insetInlineStart: space[4],
  display: "flex",
  alignItems: "center",
  color: toneColors.foregroundMuted,
  pointerEvents: "none",
})

const bottomBarStyle = Style.make({
  position: "sticky",
  insetBlockEnd: viewport.keyboardOffset,
  marginBlockStart: "auto",
  flexShrink: 0,
  paddingInline: space[2],
  paddingBlockStart: space[2],
  paddingBlockEnd: viewport.safeAreaBottom,
  backgroundColor: Color.alpha(toneColors.backgroundCard, 0.95),
  backdropFilter: blur.chrome,
}).pipe(Style.when(breakpoint.lg, { display: "none" }))

const bottomItemsStyle = Style.make({
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-around",
})

const bottomItemStyle = Style.make({
  display: "flex",
  minInlineSize: space[11],
  flexDirection: "column",
  gap: `calc(${space[1]} / 2)`,
  borderRadius: radius.full,
  paddingInline: space[1],
  paddingBlockEnd: space[2],
  fontSize: fontSize.caption,
  color: tones.neutral.foregroundMuted,
})

const bottomCurrentItemStyle = Style.merge(
  bottomItemStyle,
  Style.make({ color: tones.accent.foreground }),
)

export type NavigationItem = Readonly<{
  label: string
  href: string
  icon: (config?: IconConfig) => Html
  isCurrent: boolean
}>

const navigationLinks = <Message>(
  items: ReadonlyArray<NavigationItem>,
  h: HtmlBuilder<Message>,
): ReadonlyArray<Html> =>
  items.map((item) =>
    AppButton.view(
      {
        children: [item.icon({ mode: item.isCurrent ? "duotone" : "outline" }), item.label],
        href: item.href,
        ariaCurrent: item.isCurrent ? "page" : "false",
        tone: "accent",
        mode: item.isCurrent ? "faded" : "bleed",
        size: "sm",
      },
      h,
    ),
  )

/** A link that looks like the search field, for pages other than search. `onClick` is sent
 *  alongside the navigation, such as to focus the field once it renders. */
export const searchLink = <Message>(
  {
    href,
    onClick,
    label,
    ariaLabel,
  }: Readonly<{ href: string; onClick: Message; label: string; ariaLabel: string }>,
  h: HtmlBuilder<Message>,
): Html =>
  h.a(
    styledAttributes(
      [h.Href(href), h.AriaLabel(ariaLabel), h.OnClick(onClick)],
      searchSurfaceStyle,
      searchLinkStyle,
    ),
    [
      h.span(styledAttributes([h.AriaHidden(true)], searchIconStyle), [
        Icons.search({ size: "sm" }),
      ]),
      label,
    ],
  )

/** One language in the menu: its `name` in that language (Português), linking to this page in it. */
export type LanguageLink = Readonly<{
  name: string
  href: string
  hreflang: string
  isCurrent: boolean
}>

export type HeaderConfig = Readonly<{
  homeHref: string
  homeLabel: string
  navigationLabel: string
  /** The search control: a link to search, or the live field on the search page. */
  search: Html
  navigation: ReadonlyArray<NavigationItem>
  /** The settings menu and sign-in, left out while searching so the field has the bar to itself. */
  trailing: ReadonlyArray<Html>
}>

/** A globe for visitors' menu: the convention people look for to change language. */
export const globeTriggerStyle = Style.make({
  display: "inline-grid",
  placeItems: "center",
  flexShrink: 0,
  blockSize: controlSize.sm,
  aspectRatio: "1",
  border: "none",
  borderRadius: radius.full,
  backgroundColor: "transparent",
  color: toneColors.foreground,
  cursor: "pointer",
  outline: "none",
}).pipe(
  Style.when(When.hover, { backgroundColor: toneColors.hover }),
  Style.when(When.focusVisible, focusRingDeclarations),
)

/** The signed-in person's avatar, opening the same menu with their account in it. */
export const avatarTriggerStyle = Style.make({
  display: "inline-flex",
  flexShrink: 0,
  padding: 0,
  border: "none",
  borderRadius: radius.full,
  backgroundColor: "transparent",
  cursor: "pointer",
  outline: "none",
}).pipe(Style.when(When.focusVisible, focusRingDeclarations))

export const menuPanelStyle = Style.make({
  inlineSize: "min(16rem, calc(100vw - 2rem))",
  padding: space[2],
})

const menuSectionStyle = Style.make({ display: "grid", rowGap: space[1] })

const menuSectionTitleStyle = Style.make({
  paddingInline: space[3],
  paddingBlock: space[1],
  color: toneColors.foregroundMuted,
})

const menuItemStyle = Style.make({
  display: "flex",
  alignItems: "center",
  gap: space[3],
  minBlockSize: controlSize.md,
  paddingInline: space[3],
  borderRadius: radius.full,
  cornerShape: "squircle",
  color: toneColors.foreground,
  fontSize: fontSize.regular,
  textDecoration: "none",
  outline: "none",
}).pipe(
  Style.when(When.hover, { backgroundColor: toneColors.hover }),
  Style.when(When.focusVisible, focusRingDeclarations),
)

const currentMenuItemStyle = Style.make({ fontWeight: fontWeight.semibold })
const menuItemLabelStyle = Style.make({ flex: 1 })

const menuRuleStyle = Style.make({
  blockSize: borderWidth.hairline,
  marginBlock: space[2],
  marginInline: space[3],
  border: "none",
  backgroundColor: toneColors.border,
})

/** What the settings menu holds: the account once signed in, then every language. */
export const menuContent = <Message>(
  {
    maybeAccount,
    languagesLabel,
    languages,
  }: Readonly<{
    maybeAccount: Option.Option<Readonly<{ label: string; href: string }>>
    languagesLabel: string
    languages: ReadonlyArray<LanguageLink>
  }>,
  h: HtmlBuilder<Message>,
): ReadonlyArray<Html> => [
  ...EffectArray.fromOption(
    Option.map(maybeAccount, (account) =>
      h.a(styledAttributes([h.Href(account.href)], menuItemStyle), [
        Icons.user({ size: "md" }),
        h.span(styledAttributes([], menuItemLabelStyle), [account.label]),
      ]),
    ),
  ),
  ...(Option.isSome(maybeAccount)
    ? [h.hr(styledAttributes([h.AriaHidden(true)], menuRuleStyle))]
    : []),
  h.nav(styledAttributes([h.AriaLabel(languagesLabel)], menuSectionStyle), [
    // Visitors' menu is only languages, already named by its title.
    ...(Option.isSome(maybeAccount)
      ? [
          h.span(styledAttributes([h.AriaHidden(true)], menuSectionTitleStyle), [
            AppText.view(
              {
                element: "span",
                appearance: "footnote",
                weight: "semibold",
                children: [languagesLabel],
              },
              h,
            ),
          ]),
        ]
      : []),
    ...languages.map((language) =>
      h.keyed("a")(
        language.hreflang,
        styledAttributes(
          [
            h.Href(language.href),
            h.Hreflang(language.hreflang),
            h.Lang(language.hreflang),
            h.AriaCurrent(language.isCurrent ? "true" : "false"),
          ],
          menuItemStyle,
          ...(language.isCurrent ? [currentMenuItemStyle] : []),
        ),
        [
          h.span(styledAttributes([], menuItemLabelStyle), [language.name]),
          ...(language.isCurrent
            ? [Icons.check({ mode: "outline", size: "sm", tone: "accent" })]
            : []),
        ],
      ),
    ),
  ]),
]

/** Visitors' way into an account, beside the menu. */
export const signInButton = <Message>(
  { label, href }: Readonly<{ label: string; href: string }>,
  h: HtmlBuilder<Message>,
): Html =>
  AppButton.view({ children: [label], href, tone: "primary", mode: "outline", size: "sm" }, h)

export const header = <Message>(config: HeaderConfig, h: HtmlBuilder<Message>): Html =>
  h.header(styledAttributes([], appBarStyle), [
    h.div(styledAttributes([], pageColumnStyle, headerInnerStyle), [
      h.a(
        styledAttributes([h.Href(config.homeHref), h.AriaLabel(config.homeLabel)], logoLinkStyle),
        [Logo.view({ styles: [headerLogoStyle] })],
      ),
      config.search,
      h.div(styledAttributes([], spacerStyle)),
      h.nav(
        styledAttributes([h.AriaLabel(config.navigationLabel)], desktopNavigationStyle),
        navigationLinks(config.navigation, h),
      ),
      ...config.trailing,
    ]),
  ])

export const bottomNavigation = <Message>(
  { label, items }: Readonly<{ label: string; items: ReadonlyArray<NavigationItem> }>,
  h: HtmlBuilder<Message>,
): Html =>
  h.nav(styledAttributes([h.AriaLabel(label)], bottomBarStyle), [
    h.div(
      styledAttributes([], bottomItemsStyle),
      items.map((item) =>
        AppButton.view(
          {
            children: [item.icon({ mode: item.isCurrent ? "duotone" : "outline" }), item.label],
            href: item.href,
            ariaCurrent: item.isCurrent ? "page" : "false",
            tone: "accent",
            mode: "bleed",
            size: "sm",
            styles: [item.isCurrent ? bottomCurrentItemStyle : bottomItemStyle],
          },
          h,
        ),
      ),
    ),
  ])
