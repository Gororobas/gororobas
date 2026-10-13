import type { Html, HtmlBuilder } from 'foldkit/html'

import { Style, Var } from '@pleat/core'
import { css } from '@pleat/foldkit'

// Continuous values go through a typed custom property. The rule is
// static; each render binds one inline --progress declaration.
const progress = Var.number('progress')

const fill = Style.make({
  width: `calc(${progress} * 1%)`,
  height: 6,
  backgroundColor: 'currentColor',
})

export const progressView = <Message>(
  percent: number,
  h: HtmlBuilder<Message>,
): Html =>
  h.div([
    h.Role('progressbar'),
    ...css(fill, Var.bind(progress, percent)),
  ])
