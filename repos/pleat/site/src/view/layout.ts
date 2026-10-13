import type { Html, HtmlBuilder } from 'foldkit/html'

import { Style, When } from '@pleat/core'
import { css } from '@pleat/foldkit'

import * as Design from '../design.ts'
import { Message, type Model, type ThemeChoice } from '../message.ts'
import {
  AppRoute,
  algebraRouter,
  foldkitUiRouter,
  generativeRouter,
  guideRouter,
  homeRouter,
  referenceRouter,
  themingRouter,
} from '../route.ts'

const { color, font, radius, space, text } = Design.tokens

export const REPOSITORY_URL = 'https://github.com/Manzanita-Research/pleat'

const HEADER_HEIGHT = '3.75rem'

const wide = When.minWidth('64rem')
const showTopNav = When.minWidth('60rem')

// STYLES

const skipLink = Style.make({
  position: 'absolute',
  insetInlineStart: space[3],
  top: space[2],
  zIndex: 30,
  paddingBlock: space[2],
  paddingInline: space[3],
  borderRadius: radius.md,
  backgroundColor: color.ink,
  color: color.canvas,
  fontSize: text.sm,
  textDecoration: 'none',
  transform: 'translateY(-200%)',
}).pipe(Style.when(When.focus, { transform: 'none' }))

const header = Style.make({
  position: 'sticky',
  top: 0,
  zIndex: 20,
  backgroundColor: color.canvas,
  borderBottom: `1px solid ${color.line}`,
})

const headerInner = Style.merge(
  Design.container,
  Style.make({
    height: HEADER_HEIGHT,
    display: 'flex',
    alignItems: 'center',
    gap: space[5],
  }),
)

const wordmark = Style.make({
  display: 'inline-flex',
  alignItems: 'center',
  gap: space[2],
  textDecoration: 'none',
  fontFamily: font.outline,
  fontSize: '1.625rem',
  lineHeight: 1,
  borderRadius: radius.sm,
}).pipe(Style.merge(Design.focusRing))

const markStyle = Style.make({
  width: 22,
  height: 22,
  color: color.accent,
  flexShrink: 0,
})

const topNav = Style.make({
  display: 'none',
  alignItems: 'center',
  gap: space[1],
  marginInlineStart: 'auto',
}).pipe(Style.when(showTopNav, { display: 'flex' }))

const topLink = Style.make({
  position: 'relative',
  paddingBlock: space[2],
  paddingInline: space[3],
  borderRadius: radius.md,
  textDecoration: 'none',
  fontSize: text.sm,
  color: color.muted,
}).pipe(
  Style.merge(Design.focusRing),
  Style.when(When.hover, { color: color.ink }),
  Style.when(When.current, { color: color.ink }),
  Style.when(When.all(When.current, When.after), {
    content: '""',
    position: 'absolute',
    insetInline: space[3],
    bottom: 3,
    height: 1.5,
    backgroundColor: color.accent,
  }),
)

const headerTools = Style.make({
  display: 'flex',
  alignItems: 'center',
  gap: space[3],
  marginInlineStart: 'auto',
}).pipe(Style.when(showTopNav, { marginInlineStart: space[2] }))

const iconSegment = Style.make({ display: 'inline-flex', gap: 2 })

const iconButton = Style.make({
  display: 'inline-grid',
  placeItems: 'center',
  width: 30,
  height: 30,
  border: 'none',
  borderRadius: 999,
  padding: 0,
  color: color.muted,
  backgroundColor: 'transparent',
  cursor: 'pointer',
}).pipe(
  Style.merge(Design.focusRing),
  Style.when(When.motionSafe, {
    transition: 'background-color 140ms ease, color 140ms ease',
  }),
  Style.when(When.hover, { color: color.ink }),
  Style.when(When.aria('pressed', 'true'), {
    backgroundColor: color.ink,
    color: color.canvas,
  }),
)

const icon = Style.make({ width: 16, height: 16, flexShrink: 0 })

const menuButton = Style.merge(
  Design.button({ tone: 'Neutral', size: 'Small' }),
  Style.make({ borderRadius: 999 }),
).pipe(Style.when(showTopNav, { display: 'none' }))

const menuPanel = Style.make({
  borderBottom: `1px solid ${color.line}`,
  backgroundColor: color.canvas,
  boxShadow: Design.tokens.shadow.overlay,
}).pipe(Style.when(showTopNav, { display: 'none' }))

const menuInner = Style.merge(
  Design.container,
  Style.make({
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr)',
    gap: space[5],
    paddingBlock: space[5],
  }),
).pipe(
  Style.when(When.minWidth('36rem'), {
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
  }),
)

const docsShell = Style.merge(
  Design.container,
  Style.make({ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: space[7] }),
).pipe(
  Style.when(wide, {
    gridTemplateColumns: '13rem minmax(0, 1fr)',
    gap: space[8],
  }),
)

const sidebar = Style.make({ display: 'none' }).pipe(
  Style.when(wide, {
    display: 'flex',
    flexDirection: 'column',
    gap: space[6],
    position: 'sticky',
    top: HEADER_HEIGHT,
    alignSelf: 'start',
    maxHeight: `calc(100vh - ${HEADER_HEIGHT})`,
    overflowY: 'auto',
    paddingBlock: space[8],
    paddingInlineEnd: space[3],
  }),
)

const navGroup = Style.make({ display: 'flex', flexDirection: 'column', gap: space[2] })

const navList = Style.make({
  listStyle: 'none',
  margin: 0,
  padding: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: 1,
})

const navLink = Style.make({
  display: 'block',
  paddingBlock: '0.3125rem',
  paddingInlineStart: space[3],
  marginInlineStart: -1,
  borderInlineStart: '1px solid transparent',
  textDecoration: 'none',
  fontSize: text.sm,
  color: color.muted,
}).pipe(
  Style.merge(Design.focusRing),
  Style.when(When.hover, { color: color.ink }),
  Style.when(When.current, {
    color: color.ink,
    borderInlineStartColor: color.accent,
  }),
)

const navRule = Style.make({ borderInlineStart: `1px solid ${color.line}` })

// NOTE: on the widest screens the docs keep a column free for the fixed
// "On this page" rail from prose.ts.
const docsMain = Style.make({
  minWidth: 0,
  paddingBlock: space[7],
}).pipe(
  Style.when(wide, { paddingBlock: space[8] }),
  Style.when(When.minWidth('86rem'), { paddingInlineEnd: '15rem' }),
)

const homeMain = Style.make({ flexGrow: 1 })

const standaloneMain = Style.merge(
  Design.container,
  Style.make({ flexGrow: 1, paddingBlock: space[9] }),
)

const main = Style.make({ flexGrow: 1 })

const footer = Style.make({
  borderTop: `1px solid ${color.line}`,
  fontSize: text.sm,
  color: color.muted,
})

const footerInner = Style.merge(
  Design.container,
  Style.make({
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr)',
    gap: space[6],
    paddingBlock: space[8],
  }),
).pipe(
  Style.when(When.minWidth('48rem'), {
    gridTemplateColumns: 'minmax(0, 2fr) repeat(2, minmax(0, 1fr))',
  }),
)

const footerBrand = Style.make({
  display: 'flex',
  flexDirection: 'column',
  gap: space[4],
  maxWidth: '22rem',
})

const footerLinks = Style.make({
  listStyle: 'none',
  margin: 0,
  padding: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: space[2],
})

const footerLink = Style.make({ color: color.ink, textDecoration: 'none' }).pipe(
  Style.merge(Design.focusRing),
  Style.when(When.hover, {
    textDecorationLine: 'underline',
    textDecorationColor: color.accent,
    textUnderlineOffset: '0.2em',
  }),
)

const colophon = Style.merge(
  Design.container,
  Style.make({
    display: 'flex',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: space[3],
    paddingBlock: space[4],
    borderTop: `1px solid ${color.line}`,
    fontSize: text.xs,
  }),
)

// NAVIGATION

type NavLink = readonly [label: string, href: string, tag: AppRoute['_tag']]

type NavGroup = Readonly<{ title: string; links: ReadonlyArray<NavLink> }>

/** The docs sidebar, grouped. New pages add a link to the group they belong to. */
export const NAV_GROUPS: ReadonlyArray<NavGroup> = [
  {
    title: 'Start',
    links: [
      ['Overview', homeRouter(), 'Home'],
      ['Guide', guideRouter(), 'Guide'],
    ],
  },
  {
    title: 'Concepts',
    links: [
      ['The algebra', algebraRouter(), 'Algebra'],
      ['Theming', themingRouter(), 'Theming'],
    ],
  },
  {
    title: 'Integrations',
    links: [
      ['Generative interfaces', generativeRouter(), 'Generative'],
      ['Foldkit UI', foldkitUiRouter(), 'FoldkitUi'],
    ],
  },
  {
    title: 'Reference',
    links: [['API reference', referenceRouter(), 'Reference']],
  },
]

const TOP_LINKS: ReadonlyArray<NavLink> = [
  ['Guide', guideRouter(), 'Guide'],
  ['Algebra', algebraRouter(), 'Algebra'],
  ['Theming', themingRouter(), 'Theming'],
  ['Foldkit UI', foldkitUiRouter(), 'FoldkitUi'],
  ['Generative', generativeRouter(), 'Generative'],
  ['Reference', referenceRouter(), 'Reference'],
]

const currentAttributes = (
  model: Model,
  h: HtmlBuilder<Message>,
  tag: AppRoute['_tag'],
): ReadonlyArray<ReturnType<typeof h.AriaCurrent>> =>
  model.route._tag === tag ? [h.AriaCurrent('page')] : []

const navGroupsView = (model: Model, h: HtmlBuilder<Message>): ReadonlyArray<Html> =>
  NAV_GROUPS.map(group =>
    h.div(
      [...css(navGroup)],
      [
        h.span([...css(Design.eyebrow)], [group.title]),
        h.ul(
          [...css(navList, navRule)],
          group.links.map(([label, href, tag]) =>
            h.li(
              [],
              [
                h.a(
                  [h.Href(href), ...currentAttributes(model, h, tag), ...css(navLink)],
                  [label],
                ),
              ],
            ),
          ),
        ),
      ],
    ),
  )

// ICONS

const ICON_PATHS: Readonly<Record<ThemeChoice | 'Menu' | 'Close', string>> = {
  System: 'M2.5 3.5h11v7h-11zM6 13.5h4M8 10.5v3',
  Light:
    'M8 5.25a2.75 2.75 0 1 0 0 5.5 2.75 2.75 0 0 0 0-5.5zM8 1.5v1.5M8 13v1.5M1.5 8H3M13 8h1.5M3.4 3.4l1.06 1.06M11.54 11.54l1.06 1.06M3.4 12.6l1.06-1.06M11.54 4.46l1.06-1.06',
  Dark: 'M13.5 9.6A5.75 5.75 0 0 1 6.4 2.5a5.75 5.75 0 1 0 7.1 7.1z',
  Menu: 'M2.5 4.5h11M2.5 8h11M2.5 11.5h11',
  Close: 'M4 4l8 8M12 4l-8 8',
}

const iconView = (h: HtmlBuilder<Message>, name: keyof typeof ICON_PATHS): Html =>
  h.svg(
    [
      h.ViewBox('0 0 16 16'),
      h.Fill('none'),
      h.Stroke('currentColor'),
      h.StrokeWidth('1.4'),
      h.StrokeLinecap('round'),
      h.StrokeLinejoin('round'),
      h.AriaHidden(true),
      ...css(icon),
    ],
    [h.path([h.D(ICON_PATHS[name])])],
  )

/** The mark: the profile of a pleat, four creases seen edge on. */
const markView = (h: HtmlBuilder<Message>): Html =>
  h.svg(
    [
      h.ViewBox('0 0 20 20'),
      h.Fill('none'),
      h.Stroke('currentColor'),
      h.StrokeWidth('1.9'),
      h.StrokeLinecap('round'),
      h.StrokeLinejoin('round'),
      h.AriaHidden(true),
      ...css(markStyle),
    ],
    [h.path([h.D('M2 15 6 5l4 10 4-10 4 10')])],
  )

export const wordmarkView = (h: HtmlBuilder<Message>): Html =>
  h.a(
    [h.Href(homeRouter()), h.AriaLabel('Pleat home'), ...css(wordmark)],
    [markView(h), 'Pleat'],
  )

// VIEW

const THEMES: ReadonlyArray<ThemeChoice> = ['System', 'Light', 'Dark']

const THEME_LABELS: Readonly<Record<ThemeChoice, string>> = {
  System: 'Match the system theme',
  Light: 'Light theme',
  Dark: 'Dark theme',
}

export const themeSwitch = (model: Model, h: HtmlBuilder<Message>): Html =>
  h.div(
    [h.Role('group'), h.AriaLabel('Color theme'), ...css(iconSegment)],
    THEMES.map(theme =>
      h.button(
        [
          h.Type('button'),
          h.AriaLabel(THEME_LABELS[theme]),
          h.Title(THEME_LABELS[theme]),
          h.AriaPressed(model.theme === theme ? 'true' : 'false'),
          h.OnClick(Message.ClickedTheme({ theme })),
          ...css(iconButton),
        ],
        [iconView(h, theme)],
      ),
    ),
  )

const headerView = (model: Model, h: HtmlBuilder<Message>): Html =>
  h.header(
    [...css(header)],
    [
      h.div(
        [...css(headerInner)],
        [
          wordmarkView(h),
          h.nav(
            [h.AriaLabel('Main'), ...css(topNav)],
            [
              ...TOP_LINKS.map(([label, href, tag]) =>
                h.a(
                  [h.Href(href), ...currentAttributes(model, h, tag), ...css(topLink)],
                  [label],
                ),
              ),
              h.a([h.Href(REPOSITORY_URL), ...css(topLink)], ['GitHub']),
            ],
          ),
          h.div(
            [...css(headerTools)],
            [
              themeSwitch(model, h),
              h.button(
                [
                  h.Type('button'),
                  h.AriaExpanded(model.isMenuOpen),
                  h.AriaControls('menu'),
                  h.OnClick(Message.ClickedMenuToggle()),
                  ...css(menuButton),
                ],
                [iconView(h, model.isMenuOpen ? 'Close' : 'Menu'), 'Menu'],
              ),
            ],
          ),
        ],
      ),
      ...(model.isMenuOpen
        ? [
            h.nav(
              [h.Id('menu'), h.AriaLabel('Docs'), ...css(menuPanel)],
              [h.div([...css(menuInner)], navGroupsView(model, h))],
            ),
          ]
        : []),
    ],
  )

const FOOTER_COLUMNS: ReadonlyArray<
  readonly [title: string, links: ReadonlyArray<readonly [string, string]>]
> = [
  [
    'Docs',
    [
      ['Guide', guideRouter()],
      ['The algebra', algebraRouter()],
      ['Theming', themingRouter()],
      ['Foldkit UI', foldkitUiRouter()],
      ['Generative interfaces', generativeRouter()],
      ['API reference', referenceRouter()],
    ],
  ],
  [
    'Project',
    [
      ['GitHub', REPOSITORY_URL],
      ['Benchmarks', `${REPOSITORY_URL}/blob/main/bench/RESULTS.md`],
      ['MIT license', `${REPOSITORY_URL}/blob/main/LICENSE`],
    ],
  ],
]

const footerView = (h: HtmlBuilder<Message>): Html =>
  h.footer(
    [...css(footer)],
    [
      h.div(
        [...css(footerInner)],
        [
          h.div(
            [...css(footerBrand)],
            [
              wordmarkView(h),
              h.p(
                [],
                [
                  'Algebraic, typed styles for Foldkit and Effect v4. Made by Manzanita Research.',
                ],
              ),
            ],
          ),
          ...FOOTER_COLUMNS.map(([title, links]) =>
            h.div(
              [...css(Design.stack(space[3]))],
              [
                h.span([...css(Design.eyebrow)], [title]),
                h.ul(
                  [...css(footerLinks)],
                  links.map(([label, href]) =>
                    h.li([], [h.a([h.Href(href), ...css(footerLink)], [label])]),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
      h.div(
        [...css(colophon)],
        [
          h.span(
            [],
            ['Set in Terminal Grotesque and Commit Mono. Styled only with Pleat.'],
          ),
          h.span(
            [],
            ['Built with Foldkit, typed with Effect, deployed by Alchemy to Cloudflare.'],
          ),
        ],
      ),
    ],
  )

const bodyView = (model: Model, h: HtmlBuilder<Message>, content: Html): Html => {
  if (model.route._tag === 'Home') {
    return h.main([h.Id('content'), ...css(homeMain)], [content])
  }
  if (model.route._tag === 'NotFound') {
    return h.main([h.Id('content'), ...css(standaloneMain)], [content])
  }
  return h.div(
    [...css(main)],
    [
      h.div(
        [...css(docsShell)],
        [
          h.nav([h.AriaLabel('Docs'), ...css(sidebar)], navGroupsView(model, h)),
          h.main([h.Id('content'), ...css(docsMain)], [content]),
        ],
      ),
    ],
  )
}

export const layoutView = (model: Model, h: HtmlBuilder<Message>, content: Html): Html =>
  h.div(
    [h.DataAttribute('theme', model.theme), ...css(Design.page)],
    [
      h.a([h.Href('#content'), ...css(skipLink)], ['Skip to content']),
      headerView(model, h),
      bodyView(model, h, content),
      footerView(h),
    ],
  )
