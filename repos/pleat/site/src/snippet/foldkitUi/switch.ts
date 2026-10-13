import type { Html, HtmlBuilder } from 'foldkit/html'

import { Switch } from '@foldkit/ui'
import { Recipe, Style, When } from '@pleat/core'
import { css } from '@pleat/foldkit'

import { Message, type Model } from '../../demo/foldkitUi.ts'
import { focusRing, tokens } from '../../design.ts'
import { column, hint } from './kit.ts'

const { color, space, text } = tokens

// PARTS

const track = When.marker('ui-switch')

const switchTrack = Recipe.make({
  name: 'Switch',
  base: Style.make({
    display: 'inline-flex',
    flexShrink: 0,
    padding: 2,
    border: 'none',
    borderRadius: 999,
    backgroundColor: color.line,
    cursor: 'pointer',
  }).pipe(
    Style.merge(Style.mark(track)),
    Style.merge(focusRing),
    Style.when(When.motionSafe, {
      transition: 'background-color 160ms',
    }),
    Style.when(When.checked, { backgroundColor: color.accent }),
    Style.when(When.disabled, {
      opacity: 0.5,
      cursor: 'not-allowed',
    }),
  ),
  variants: {
    size: {
      Small: { width: 32, height: 18 },
      Medium: { width: 44, height: 24 },
    },
  },
  defaults: { size: 'Medium' },
})

// The thumb has no state of its own: it moves when the track it sits in is checked.
const switchThumb = Style.make({
  height: '100%',
  aspectRatio: '1',
  borderRadius: 999,
  backgroundColor: color.surface,
  boxShadow: `0 1px 2px ${color.muted}`,
}).pipe(
  Style.when(When.motionSafe, { transition: 'translate 160ms' }),
  Style.when(When.within(track, When.checked), {
    translate: '100%',
  }),
)

const switchRow = Style.make({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: space[4],
})

const switchLabel = Style.make({
  fontSize: text.sm,
  fontWeight: 600,
  cursor: 'pointer',
})

// VIEW

type SwitchConfig = Readonly<{
  id: string
  label: string
  description: string
  isChecked: boolean
  onToggle: (isChecked: boolean) => Message
  isDisabled?: boolean
  size?: 'Small' | 'Medium'
}>

const labeledSwitch = (
  config: SwitchConfig,
  h: HtmlBuilder<Message>,
): Html =>
  Switch.view(
    {
      id: config.id,
      isChecked: config.isChecked,
      onToggle: config.onToggle,
      isDisabled: config.isDisabled ?? false,
      hasDescription: true,
      toView: attributes =>
        h.div(
          [...css(switchRow)],
          [
            h.div(
              [],
              [
                h.div(
                  [...attributes.label, ...css(switchLabel)],
                  [config.label],
                ),
                h.div(
                  [...attributes.description, ...css(hint)],
                  [config.description],
                ),
              ],
            ),
            h.button(
              [
                ...attributes.button,
                ...css(
                  switchTrack({ size: config.size ?? 'Medium' }),
                ),
              ],
              [h.span([...css(switchThumb)])],
            ),
          ],
        ),
    },
    h,
  )

export const switchDemo = (
  model: Model,
  h: HtmlBuilder<Message>,
): Html =>
  h.div(
    [...css(column)],
    [
      labeledSwitch(
        {
          id: 'ui-switch-digest',
          label: 'Weekly digest',
          description: 'A summary of new patterns every Monday.',
          isChecked: model.isDigestOn,
          onToggle: isChecked =>
            Message.ToggledDigest({ isChecked }),
        },
        h,
      ),
      labeledSwitch(
        {
          id: 'ui-switch-mentions',
          label: 'Mentions',
          description: 'When someone tags you in a comment.',
          isChecked: model.isMentionsOn,
          onToggle: isChecked =>
            Message.ToggledMentions({ isChecked }),
          size: 'Small',
        },
        h,
      ),
      labeledSwitch(
        {
          id: 'ui-switch-billing',
          label: 'Billing alerts',
          description: 'Required while you have an open invoice.',
          isChecked: true,
          onToggle: isChecked =>
            Message.ToggledMentions({ isChecked }),
          isDisabled: true,
        },
        h,
      ),
    ],
  )
