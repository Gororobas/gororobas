import type { Html, HtmlBuilder } from 'foldkit/html'

import { Style, When } from '@pleat/core'
import { css } from '@pleat/foldkit'

import * as Design from '../design.ts'

const { color, space, text, radius } = Design.tokens

const INLINE = /(`[^`]+`|\[[^\]]+\]\([^)]+\)|\*\*[^*]+\*\*)/g

/** Text with `code`, [links](/path), and **bold**. */
export const rich = <Message>(
  h: HtmlBuilder<Message>,
  text: string,
): ReadonlyArray<Html | string> =>
  text.split(INLINE).flatMap((part): ReadonlyArray<Html | string> => {
    if (part === '') {
      return []
    }
    if (part.startsWith('`') && part.endsWith('`')) {
      return [h.code([...css(Design.inlineCode)], [part.slice(1, -1)])]
    }
    if (part.startsWith('**') && part.endsWith('**')) {
      return [h.strong([], [part.slice(2, -2)])]
    }
    const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(part)
    if (link !== null) {
      const [, label = '', href = ''] = link
      return [h.a([h.Href(href), ...css(Design.link)], [label])]
    }
    return [part]
  })

export const paragraph = <Message>(h: HtmlBuilder<Message>, text: string): Html =>
  h.p([...css(Design.body)], rich(h, text))

export const bullets = <Message>(
  h: HtmlBuilder<Message>,
  items: ReadonlyArray<string>,
): Html =>
  h.ul(
    [...css(Design.list)],
    items.map(item => h.li([...css(Design.listItem)], rich(h, item))),
  )

// NOTE: sections are separated by hairlines rather than boxes, and the
// heading sits a little closer to its own text than to the rule above it.
const sectionStyle = Style.merge(
  Design.prose,
  Style.make({
    scrollMarginTop: '6rem',
    paddingBlockStart: space[6],
    borderTop: `1px solid ${color.line}`,
  }),
)

const sectionHeading = Style.merge(
  Design.heading,
  Style.make({ marginBlockEnd: space[1] }),
)

const anchor = Style.make({
  color: 'inherit',
  textDecoration: 'none',
  borderRadius: radius.sm,
}).pipe(
  Style.merge(Design.focusRing),
  Style.when(When.after, {
    content: '"§"',
    marginInlineStart: '0.35em',
    fontSize: '0.6em',
    verticalAlign: '0.25em',
    color: color.accent,
    opacity: 0,
  }),
  Style.when(When.all(When.hover, When.after), { opacity: 1 }),
  Style.when(When.all(When.focusVisible, When.after), { opacity: 1 }),
)

export const section = <Message>(
  h: HtmlBuilder<Message>,
  id: string,
  title: string,
  children: ReadonlyArray<Html>,
): Html =>
  h.section(
    [h.Id(id), ...css(sectionStyle)],
    [
      h.h2([...css(sectionHeading)], [h.a([h.Href(`#${id}`), ...css(anchor)], [title])]),
      ...children,
    ],
  )

export const subsection = <Message>(
  h: HtmlBuilder<Message>,
  title: string,
  children: ReadonlyArray<Html>,
): Html =>
  h.div(
    [...css(Design.stack(space[3]))],
    [h.h3([...css(Design.subheading)], [title]), ...children],
  )

const RAIL_WIDTH = '12rem'

const rail = Style.make({ display: 'none' }).pipe(
  Style.when(When.minWidth('86rem'), {
    display: 'flex',
    flexDirection: 'column',
    gap: space[3],
    position: 'fixed',
    top: '8.25rem',
    insetInlineEnd: 'max(2rem, calc(50% - 40rem))',
    width: RAIL_WIDTH,
    maxHeight: 'calc(100vh - 10rem)',
    overflowY: 'auto',
  }),
)

const railList = Style.make({
  listStyle: 'none',
  margin: 0,
  padding: 0,
  display: 'flex',
  flexDirection: 'column',
  borderInlineStart: `1px solid ${color.line}`,
})

const railLink = Style.make({
  display: 'block',
  paddingBlock: '0.3125rem',
  paddingInlineStart: space[3],
  marginInlineStart: -1,
  borderInlineStart: '1px solid transparent',
  fontSize: text.sm,
  lineHeight: 1.4,
  color: color.muted,
  textDecoration: 'none',
}).pipe(
  Style.merge(Design.focusRing),
  Style.when(When.hover, {
    color: color.ink,
    borderInlineStartColor: color.accent,
  }),
)

/** An "On this page" list of a page's sections, shown in a rail beside the article on wide
 *  screens. Pass the same ids and titles as the page's `section` calls. */
export const onThisPage = <Message>(
  h: HtmlBuilder<Message>,
  entries: ReadonlyArray<readonly [id: string, title: string]>,
): Html =>
  h.nav(
    [h.AriaLabel('On this page'), ...css(rail)],
    [
      h.span([...css(Design.eyebrow)], ['On this page']),
      h.ul(
        [...css(railList)],
        entries.map(([id, title]) =>
          h.li([], [h.a([h.Href(`#${id}`), ...css(railLink)], [title])]),
        ),
      ),
    ],
  )
