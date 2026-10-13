import type { Html, HtmlBuilder } from 'foldkit/html'

import { Tooltip } from '@foldkit/ui'
import { Global, Style, When } from '@pleat/core'
import { css } from '@pleat/foldkit'

import { Message, type Model } from '../../demo/foldkitUi.ts'
import { tokens } from '../../design.ts'
import { uiButton } from './kit.ts'

const { color, radius, space, text } = tokens

// PARTS

// Tooltip has no transition states: its panel mounts when it opens. A
// keyframe animation plays on mount instead.
const rise = Global.keyframes('ui-tooltip-rise', {
  from: { opacity: 0, translate: '0 3px' },
  to: { opacity: 1, translate: '0 0' },
})

const tooltipPanel = Style.make({
  maxWidth: '16rem',
  paddingBlock: space[1],
  paddingInline: space[2],
  borderRadius: radius.sm,
  backgroundColor: color.ink,
  color: color.canvas,
  fontSize: text.xs,
  lineHeight: 1.4,
  zIndex: 40,
}).pipe(
  Style.when(When.motionSafe, {
    animation: `${rise} 140ms ease-out`,
  }),
)

// VIEW

export const tooltipDemo = (
  model: Model,
  h: HtmlBuilder<Message>,
): Html =>
  h.submodel({
    slotId: 'ui-tooltip',
    model: model.tooltip,
    view: Tooltip.view,
    toParentMessage: message =>
      Message.GotTooltipMessage({ message }),
    viewInputs: {
      anchor: { placement: 'top', gap: 6 },
      toView: ({ trigger, panel, isVisible }) =>
        h.span(
          [],
          [
            h.button(
              [...trigger, ...css(uiButton({ size: 'Medium' }))],
              ['Copy link'],
            ),
            ...(isVisible
              ? [
                  h.div(
                    [...panel, ...css(tooltipPanel)],
                    ['Anyone with the link can view'],
                  ),
                ]
              : []),
          ],
        ),
    },
  })
