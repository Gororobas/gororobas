import { Color, Style, When } from "@pleat/core"
import { Array as EffectArray, Option } from "effect"
import type { Html, HtmlBuilder } from "foldkit/html"

import { AppButton } from "../app-button"
import type { IconConfig } from "../icons"
import * as Icons from "../icons"
import * as Logo from "../logo"
import { styledAttributes } from "../pleat-attributes"
import { profileAvatar } from "../profile-avatar/view"
import { focusRingDeclarations } from "../styles/focus-ring"
import { pageColumnStyle } from "../styles/page-column"
import { blur } from "../theme"
import {
  borderWidth,
  breakpoint,
  controlSize,
  duration,
  fontSize,
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

const accountLinkStyle = Style.make({
  flexShrink: 0,
  borderRadius: radius.full,
  outline: "none",
}).pipe(Style.when(When.focusVisible, focusRingDeclarations))

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

/** `accountLabel` names the link to the viewer's account, such as "Conta de Ana". */
export type Viewer = Readonly<{ name: string; accountLabel: string }>

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

export type Account = Readonly<{
  href: string
  signInLabel: string
  maybeViewer: Option.Option<Viewer>
}>

/** One language in the switcher: a short `label` (PT) and its `name` in that language (Português). */
export type LanguageLink = Readonly<{
  label: string
  name: string
  href: string
  hreflang: string
  isCurrent: boolean
}>

export type HeaderConfig = Readonly<{
  homeHref: string
  homeLabel: string
  navigationLabel: string
  languagesLabel: string
  languages: ReadonlyArray<LanguageLink>
  /** The search control: a link to search, or the live field on the search page. */
  search: Html
  navigation: ReadonlyArray<NavigationItem>
  /** Omitted while searching, so the field has the bar to itself. */
  maybeAccount: Option.Option<Account>
}>

const languageLinksStyle = Style.make({ display: "flex", gap: space[1], flexShrink: 0 })

const languageLinks = <Message>(
  { label, languages }: Readonly<{ label: string; languages: ReadonlyArray<LanguageLink> }>,
  h: HtmlBuilder<Message>,
): Html =>
  h.nav(
    styledAttributes([h.AriaLabel(label)], languageLinksStyle),
    languages.map((language) =>
      AppButton.view(
        {
          children: [language.label],
          ariaLabel: language.name,
          title: language.name,
          href: language.href,
          attributes: [h.Hreflang(language.hreflang), h.Lang(language.hreflang)],
          ariaCurrent: language.isCurrent ? "true" : "false",
          tone: "neutral",
          mode: language.isCurrent ? "faded" : "bleed",
          size: "sm",
        },
        h,
      ),
    ),
  )

const accountView = <Message>(account: Account, h: HtmlBuilder<Message>): Html =>
  Option.match(account.maybeViewer, {
    onNone: () =>
      AppButton.view(
        {
          children: [account.signInLabel],
          href: account.href,
          tone: "primary",
          mode: "outline",
          size: "sm",
        },
        h,
      ),
    onSome: (viewer) =>
      h.a(
        styledAttributes(
          [h.Href(account.href), h.AriaLabel(viewer.accountLabel)],
          accountLinkStyle,
        ),
        [profileAvatar({ name: viewer.name, maybePhotoUrl: Option.none(), size: "compact" }, h)],
      ),
  })

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
      ...(EffectArray.isReadonlyArrayNonEmpty(config.languages)
        ? [languageLinks({ label: config.languagesLabel, languages: config.languages }, h)]
        : []),
      ...EffectArray.fromOption(
        Option.map(config.maybeAccount, (account) => accountView(account, h)),
      ),
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
