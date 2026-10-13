import { Array } from 'effect'
import type { Html, HtmlBuilder } from 'foldkit/html'

import { Disclosure } from '@foldkit/ui'
import { Style, When } from '@pleat/core'
import { css } from '@pleat/foldkit'

import {
  Message,
  type Model,
  type Question,
} from '../../demo/foldkitUi.ts'
import { focusRing, tokens } from '../../design.ts'
import { chevron, trigger } from './kit.ts'

const { color, radius, space, text } = tokens

// PARTS

const disclosureList = Style.make({
  width: '100%',
  maxWidth: '34rem',
  border: `1px solid ${color.line}`,
  borderRadius: radius.lg,
  backgroundColor: color.surface,
  overflow: 'hidden',
})

const disclosureItem = Style.empty.pipe(
  Style.when(When.not(When.firstChild), {
    borderTop: `1px solid ${color.line}`,
  }),
)

// The button carries data-open and aria-expanded, so the shared chevron,
// which turns inside an open trigger, works here unchanged.
const disclosureButton = Style.make({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: space[3],
  width: '100%',
  paddingBlock: space[3],
  paddingInline: space[4],
  border: 'none',
  backgroundColor: 'transparent',
  color: color.ink,
  fontFamily: 'inherit',
  fontSize: text.sm,
  fontWeight: 600,
  textAlign: 'start',
  cursor: 'pointer',
}).pipe(
  Style.merge(Style.mark(trigger)),
  Style.merge(focusRing),
  Style.when(When.hover, { backgroundColor: color.sunken }),
  Style.when(When.open, { color: color.accent }),
)

// animatePanel animates the height with an inline grid, so the panel only
// styles its padding and type.
const disclosurePanel = Style.make({
  paddingInline: space[4],
  paddingBottom: space[4],
  fontSize: text.sm,
  color: color.muted,
})

// VIEW

const QUESTIONS: ReadonlyArray<
  readonly [Question, string, string]
> = [
  [
    'Attributes',
    'Which attributes does Foldkit UI set?',
    'data-open, data-active, data-selected, data-checked, data-disabled, and the ARIA states beside them. Each has a When condition of the same name.',
  ],
  [
    'Transitions',
    'How do transitions work?',
    'Animated parts get data-closed at the start of entering and the end of leaving, with data-transition throughout. Style the open look as the base and the closed look under When.closed.',
  ],
  [
    'Inline',
    'Is there anything Pleat can’t style?',
    'Inline styles win over classes. Foldkit UI positions floating panels inline, and animates this panel’s height inline, so leave those properties to it.',
  ],
]

export const disclosureDemo = (
  model: Model,
  h: HtmlBuilder<Message>,
): Html =>
  h.div(
    [...css(disclosureList)],
    QUESTIONS.map(([question, title, answer]) =>
      Disclosure.view(
        {
          id: `ui-disclosure-${question.toLowerCase()}`,
          isOpen: Array.contains(model.openQuestions, question),
          onToggle: isOpen =>
            Message.ToggledQuestion({ question, isOpen }),
          toView: ({ button, panel, animatePanel }) =>
            h.div(
              [...css(disclosureItem)],
              [
                h.button(
                  [...button, ...css(disclosureButton)],
                  [title, h.span([...css(chevron)])],
                ),
                animatePanel(
                  h.div(
                    [...panel, ...css(disclosurePanel)],
                    [answer],
                  ),
                ),
              ],
            ),
        },
        h,
      ),
    ),
  )
