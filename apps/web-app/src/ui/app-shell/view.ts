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
  backdropFilter: "blur(8px)",
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

export type Viewer = Readonly<{ name: string }>

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

/** A link that looks like the search field, for pages other than search. */
export const searchLink = <Message>(href: string, h: HtmlBuilder<Message>): Html =>
  h.a(
    styledAttributes(
      [h.Href(href), h.AriaLabel("Abrir busca")],
      searchSurfaceStyle,
      searchLinkStyle,
    ),
    [
      h.span(styledAttributes([h.AriaHidden(true)], searchIconStyle), [
        Icons.search({ size: "sm" }),
      ]),
      "Buscar",
    ],
  )

export type Account = Readonly<{ href: string; maybeViewer: Option.Option<Viewer> }>

export type HeaderConfig = Readonly<{
  homeHref: string
  /** The search control: a link to search, or the live field on the search page. */
  search: Html
  navigation: ReadonlyArray<NavigationItem>
  /** Omitted while searching, so the field has the bar to itself. */
  maybeAccount: Option.Option<Account>
}>

const accountView = <Message>(account: Account, h: HtmlBuilder<Message>): Html =>
  Option.match(account.maybeViewer, {
    onNone: () =>
      AppButton.view(
        { children: ["Entrar"], href: account.href, tone: "primary", mode: "outline", size: "sm" },
        h,
      ),
    onSome: (viewer) =>
      h.a(
        styledAttributes(
          [h.Href(account.href), h.AriaLabel(`Conta de ${viewer.name}`)],
          accountLinkStyle,
        ),
        [profileAvatar({ name: viewer.name, maybePhotoUrl: Option.none(), size: "compact" }, h)],
      ),
  })

export const header = <Message>(config: HeaderConfig, h: HtmlBuilder<Message>): Html =>
  h.header(styledAttributes([], appBarStyle), [
    h.div(styledAttributes([], pageColumnStyle, headerInnerStyle), [
      h.a(
        styledAttributes(
          [h.Href(config.homeHref), h.AriaLabel("Gororobas: início")],
          logoLinkStyle,
        ),
        [Logo.view({ styles: [headerLogoStyle] })],
      ),
      config.search,
      h.div(styledAttributes([], spacerStyle)),
      h.nav(
        styledAttributes([h.AriaLabel("Navegação principal")], desktopNavigationStyle),
        navigationLinks(config.navigation, h),
      ),
      ...EffectArray.fromOption(
        Option.map(config.maybeAccount, (account) => accountView(account, h)),
      ),
    ]),
  ])

export const bottomNavigation = <Message>(
  items: ReadonlyArray<NavigationItem>,
  h: HtmlBuilder<Message>,
): Html =>
  h.nav(styledAttributes([h.AriaLabel("Navegação principal")], bottomBarStyle), [
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
