import type { Html, HtmlBuilder } from 'foldkit/html'

import { Select } from '@foldkit/ui'
import { Style, When } from '@pleat/core'
import { css } from '@pleat/foldkit'

import { Message, type Model } from '../../demo/foldkitUi.ts'
import { focusRing, tokens } from '../../design.ts'
import { chevron, cluster, field, fieldLabel, hint } from './kit.ts'

const { color, radius, space, text } = tokens

// PARTS

const selectControl = Style.make({
  appearance: 'none',
  minWidth: '13rem',
  paddingBlock: space[2],
  paddingInlineStart: space[3],
  paddingInlineEnd: space[6],
  border: `1px solid ${color.line}`,
  borderRadius: radius.md,
  backgroundColor: color.surface,
  color: color.ink,
  fontFamily: 'inherit',
  fontSize: text.sm,
  cursor: 'pointer',
}).pipe(
  Style.merge(focusRing),
  Style.when(When.hover, { borderColor: color.muted }),
  // isInvalid sets data-invalid and aria-invalid. Invalid outranks hover.
  Style.when(When.invalid, {
    borderColor: color.accent,
    boxShadow: `0 0 0 3px ${color.accentSoft}`,
  }),
  // A native select gets the disabled property, which :disabled matches.
  Style.when(When.disabled, {
    opacity: 0.5,
    cursor: 'not-allowed',
  }),
)

const selectBox = Style.make({
  position: 'relative',
  display: 'inline-flex',
})

const selectChevron = Style.merge(
  chevron,
  Style.make({
    position: 'absolute',
    insetInlineEnd: space[3],
    top: '50%',
    pointerEvents: 'none',
  }),
)

// VIEW

const WEIGHTS: ReadonlyArray<
  readonly [value: string, label: string]
> = [
  ['', 'Choose a weight'],
  ['Light', 'Light, under 150 gsm'],
  ['Medium', 'Medium, 150 to 250 gsm'],
  ['Heavy', 'Heavy, over 250 gsm'],
]

const weightSelect = (
  config: Readonly<{
    id: string
    label: string
    value: string
    isDisabled: boolean
  }>,
  h: HtmlBuilder<Message>,
): Html =>
  Select.view(
    {
      id: config.id,
      value: config.value,
      isDisabled: config.isDisabled,
      isInvalid: !config.isDisabled && config.value === '',
      hasDescription: true,
      onChange: weight => Message.UpdatedWeight({ weight }),
      toView: ({ select, label, description }) =>
        h.div(
          [...css(field)],
          [
            h.label([...label, ...css(fieldLabel)], [config.label]),
            h.div(
              [...css(selectBox)],
              [
                h.select(
                  [...select, ...css(selectControl)],
                  WEIGHTS.map(([value, text]) =>
                    h.option([h.Value(value)], [text]),
                  ),
                ),
                h.span([...css(selectChevron)]),
              ],
            ),
            h.span(
              [...description, ...css(hint)],
              [
                config.isDisabled
                  ? 'Set by the pattern.'
                  : 'Shown on the cutting list.',
              ],
            ),
          ],
        ),
    },
    h,
  )

export const selectDemo = (
  model: Model,
  h: HtmlBuilder<Message>,
): Html =>
  h.div(
    [...css(cluster)],
    [
      weightSelect(
        {
          id: 'ui-select-weight',
          label: 'Fabric weight',
          value: model.weight,
          isDisabled: false,
        },
        h,
      ),
      weightSelect(
        {
          id: 'ui-select-lining',
          label: 'Lining weight',
          value: 'Light',
          isDisabled: true,
        },
        h,
      ),
    ],
  )
