import { Option } from 'effect'
import type { Html, HtmlBuilder } from 'foldkit/html'

import { Style } from '@pleat/core'
import { css, cssClass } from '@pleat/foldkit'

import {
  AssigneeListbox,
  Message,
  type Model,
  Person,
} from '../../demo/foldkitUi.ts'
import { tokens } from '../../design.ts'
import {
  chevron,
  field,
  fieldLabel,
  optionCheck,
  optionItem,
  panel,
  spread,
  triggerButton,
} from './kit.ts'

const { color, text } = tokens

const avatar = Style.make({
  display: 'inline-grid',
  placeItems: 'center',
  width: 22,
  height: 22,
  borderRadius: 999,
  backgroundColor: color.accentSoft,
  color: color.accent,
  fontSize: text.xs,
  fontWeight: 700,
})

const person = Style.make({
  display: 'inline-flex',
  alignItems: 'center',
  gap: 8,
})

const personView = (name: Person, h: HtmlBuilder<Message>): Html =>
  h.span(
    [...css(person)],
    [h.span([...css(avatar)], [name.slice(0, 1)]), name],
  )

// The check mark in each option shows through When.within(option,
// When.selected), so itemToConfig never looks at isSelected.
export const listboxDemo = (
  model: Model,
  h: HtmlBuilder<Message>,
): Html =>
  h.div(
    [...css(field)],
    [
      h.span(
        [h.Id('ui-listbox-label'), ...css(fieldLabel)],
        ['Assignee'],
      ),
      h.submodel({
        slotId: 'ui-listbox',
        model: model.listbox,
        view: AssigneeListbox.view,
        toParentMessage: message =>
          Message.GotListboxMessage({ message }),
        viewInputs: {
          items: Person.literals,
          maybeSelectedValue: model.maybeAssignee,
          ariaLabelledBy: 'ui-listbox-label',
          isItemDisabled: name => name === 'Margaret',
          buttonContent: h.span(
            [...css(spread)],
            [
              Option.match(model.maybeAssignee, {
                onNone: () => h.span([], ['Nobody']),
                onSome: name => personView(name, h),
              }),
              h.span([...css(chevron)]),
            ],
          ),
          buttonClassName: cssClass(triggerButton),
          itemsClassName: cssClass(panel),
          itemToConfig: name => ({
            className: cssClass(optionItem({})),
            content: h.span(
              [...css(spread)],
              [personView(name, h), h.span([...css(optionCheck)])],
            ),
          }),
          anchor: { placement: 'bottom-start', gap: 6 },
        },
      }),
    ],
  )
