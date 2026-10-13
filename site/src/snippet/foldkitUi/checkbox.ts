import { Array } from 'effect'
import type { Html, HtmlBuilder } from 'foldkit/html'

import { Checkbox } from '@foldkit/ui'
import { Style, When } from '@pleat/core'
import { css } from '@pleat/foldkit'

import { Message, type Model, Step } from '../../demo/foldkitUi.ts'
import { focusRing, tokens } from '../../design.ts'

const { color, radius, space, text } = tokens

// PARTS

const box = When.marker('ui-checkbox')

const checkboxBox = Style.make({
  display: 'inline-grid',
  placeItems: 'center',
  flexShrink: 0,
  width: 18,
  height: 18,
  padding: 0,
  borderRadius: radius.sm,
  border: `1.5px solid ${color.muted}`,
  backgroundColor: color.surface,
  cursor: 'pointer',
}).pipe(
  Style.merge(Style.mark(box)),
  Style.merge(focusRing),
  Style.when(When.checked, {
    backgroundColor: color.accent,
    borderColor: color.accent,
  }),
  // A mixed checkbox gets data-indeterminate and aria-checked="mixed",
  // never data-checked, so it needs its own condition.
  Style.when(When.indeterminate, {
    backgroundColor: color.accent,
    borderColor: color.accent,
  }),
  Style.when(When.disabled, {
    opacity: 0.5,
    cursor: 'not-allowed',
  }),
)

const glyph = Style.make({ gridArea: '1 / 1', opacity: 0 })

const tick = Style.merge(
  glyph,
  Style.make({
    width: 5,
    height: 9,
    marginTop: -2,
    borderRight: `2px solid ${color.onAccent}`,
    borderBottom: `2px solid ${color.onAccent}`,
    rotate: '45deg',
  }),
).pipe(Style.when(When.within(box, When.checked), { opacity: 1 }))

const dash = Style.merge(
  glyph,
  Style.make({
    width: 8,
    height: 2,
    borderRadius: 1,
    backgroundColor: color.onAccent,
  }),
).pipe(
  Style.when(When.within(box, When.indeterminate), { opacity: 1 }),
)

const checkboxRow = Style.make({
  display: 'flex',
  alignItems: 'center',
  gap: space[3],
  fontSize: text.sm,
})

const checklist = Style.make({
  display: 'flex',
  flexDirection: 'column',
  gap: space[3],
})

const nested = Style.merge(
  checklist,
  Style.make({ paddingInlineStart: space[6] }),
)

// VIEW

type CheckboxConfig = Readonly<{
  id: string
  label: string
  isChecked: boolean
  isIndeterminate?: boolean
  onToggle: (isChecked: boolean) => Message
}>

const labeledCheckbox = (
  config: CheckboxConfig,
  h: HtmlBuilder<Message>,
): Html =>
  Checkbox.view(
    {
      id: config.id,
      isChecked: config.isChecked,
      isIndeterminate: config.isIndeterminate ?? false,
      onToggle: config.onToggle,
      toView: attributes =>
        h.div(
          [...css(checkboxRow)],
          [
            h.button(
              [...attributes.checkbox, ...css(checkboxBox)],
              [h.span([...css(tick)]), h.span([...css(dash)])],
            ),
            h.span([...attributes.label], [config.label]),
          ],
        ),
    },
    h,
  )

export const checkboxDemo = (
  model: Model,
  h: HtmlBuilder<Message>,
): Html => {
  const doneCount = model.doneSteps.length
  const isAllDone = doneCount === Step.literals.length
  return h.div(
    [...css(checklist)],
    [
      labeledCheckbox(
        {
          id: 'ui-checkbox-all',
          label: 'Finish the hem',
          isChecked: isAllDone,
          isIndeterminate: doneCount > 0 && !isAllDone,
          onToggle: () =>
            Message.ToggledAllSteps({ isChecked: !isAllDone }),
        },
        h,
      ),
      h.div(
        [...css(nested)],
        Step.literals.map(step =>
          labeledCheckbox(
            {
              id: `ui-checkbox-${step.toLowerCase()}`,
              label: step,
              isChecked: Array.contains(model.doneSteps, step),
              onToggle: isChecked =>
                Message.ToggledStep({ step, isChecked }),
            },
            h,
          ),
        ),
      ),
    ],
  )
}
