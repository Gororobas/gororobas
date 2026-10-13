import type { Html, HtmlBuilder } from 'foldkit/html'

import { Recipe, Style, When } from '@pleat/core'
import { css } from '@pleat/foldkit'

const card = Style.make({
  display: 'grid',
  gap: 12,
  padding: 20,
  borderRadius: 12,
}).pipe(
  Style.when(When.hover, {
    boxShadow: '0 8px 24px -12px rgb(0 0 0 / 0.3)',
  }),
)

const badge = Recipe.make({
  variants: {
    status: {
      Draft: { color: 'oklch(50% 0.02 60)' },
      Live: { color: 'oklch(48% 0.12 150)' },
    },
  },
})

type Post = Readonly<{ title: string; status: 'Draft' | 'Live' }>

export const postView = <Message>(
  post: Post,
  h: HtmlBuilder<Message>,
): Html =>
  h.article(
    [...css(card)],
    [
      h.h2([], [post.title]),
      h.span(
        [...css(badge({ status: post.status }))],
        [post.status],
      ),
    ],
  )
