import type { Html, HtmlBuilder } from 'foldkit/html'

import { Style } from '@pleat/core'
import { css } from '@pleat/foldkit'

import * as Design from '../design.ts'
import type { Message } from '../message.ts'
import { guideRouter, homeRouter } from '../route.ts'
import { pleatView } from './pleat.ts'

const { space } = Design.tokens

// STYLES

const notFound = Style.make({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: space[5],
  maxWidth: '40rem',
  marginInline: 'auto',
  textAlign: 'center',
})

const folds = Style.make({ width: 'min(100%, 28rem)' })

const lede = Style.merge(Design.lede, Style.make({ marginInline: 'auto' }))

const actions = Style.merge(
  Design.row(space[4]),
  Style.make({ justifyContent: 'center' }),
)

// VIEW

// NOTE: one prerendered 404.html answers every missing path, so the page
// must not depend on the path or hydration would disagree with it.
export const notFoundView = (h: HtmlBuilder<Message>): Html =>
  h.article(
    [...css(notFound)],
    [
      h.div([...css(folds)], [pleatView(h, 'Small')]),
      h.span([...css(Design.eyebrow)], ['404 · Not found']),
      h.h1([...css(Design.display)], ['Nothing is folded here']),
      h.p([...css(lede)], ['There is no page at this address. It may have moved.']),
      h.div(
        [...css(actions)],
        [
          h.a(
            [h.Href(homeRouter()), ...css(Design.button({ tone: 'Primary' }))],
            ['Go home'],
          ),
          h.a([h.Href(guideRouter()), ...css(Design.link)], ['Read the guide']),
        ],
      ),
    ],
  )
