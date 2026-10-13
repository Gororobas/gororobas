import { Option, String } from 'effect'
import type { Html, HtmlBuilder } from 'foldkit/html'

import { Style, When } from '@pleat/core'
import { css, cssClass } from '@pleat/foldkit'

import {
  Fabric,
  FabricCombobox,
  Message,
  type Model,
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
  trigger,
} from './kit.ts'

const { color, radius, space, text } = tokens

// PARTS

const comboboxField = Style.make({
  display: 'flex',
  alignItems: 'center',
  minWidth: '15rem',
  border: `1px solid ${color.line}`,
  borderRadius: radius.md,
  backgroundColor: color.surface,
}).pipe(
  Style.when(When.hover, { borderColor: color.muted }),
  Style.when(When.focusWithin, {
    borderColor: color.accent,
    boxShadow: `0 0 0 3px ${color.accentSoft}`,
  }),
)

const comboboxInput = Style.make({
  flexGrow: 1,
  minWidth: 0,
  paddingBlock: space[2],
  paddingInline: space[3],
  border: 'none',
  outline: 'none',
  backgroundColor: 'transparent',
  color: color.ink,
  fontFamily: 'inherit',
  fontSize: text.sm,
}).pipe(Style.when(When.placeholder, { color: color.muted }))

// The toggle carries aria-expanded, so the shared chevron turns inside it.
const comboboxToggle = Style.make({
  display: 'inline-grid',
  placeItems: 'center',
  alignSelf: 'stretch',
  paddingInline: space[3],
  border: 'none',
  backgroundColor: 'transparent',
  cursor: 'pointer',
}).pipe(Style.merge(Style.mark(trigger)))

// VIEW

export const comboboxDemo = (
  model: Model,
  h: HtmlBuilder<Message>,
): Html => {
  const query = String.toLowerCase(model.combobox.inputValue)
  const matches = Fabric.literals.filter(fabric =>
    String.includes(query)(String.toLowerCase(fabric)),
  )
  return h.div(
    [...css(field)],
    [
      h.label(
        [h.For('ui-combobox-input'), ...css(fieldLabel)],
        ['Fabric'],
      ),
      h.submodel({
        slotId: 'ui-combobox',
        model: model.combobox,
        view: FabricCombobox.view,
        toParentMessage: message =>
          Message.GotComboboxMessage({ message }),
        viewInputs: {
          items: matches,
          maybeSelectedValue: model.maybeFabric,
          restingInputValue: Option.getOrElse(
            model.maybeFabric,
            () => '',
          ),
          itemToValue: fabric => fabric,
          itemToDisplayText: fabric => fabric,
          isItemDisabled: fabric => fabric === 'Organza',
          inputPlaceholder: 'Search fabrics',
          inputWrapperClassName: cssClass(comboboxField),
          inputClassName: cssClass(comboboxInput),
          buttonContent: h.span([...css(chevron)]),
          buttonClassName: cssClass(comboboxToggle),
          itemsClassName: cssClass(panel),
          itemToConfig: fabric => ({
            className: cssClass(optionItem({})),
            content: h.span(
              [...css(spread)],
              [fabric, h.span([...css(optionCheck)])],
            ),
          }),
          anchor: { placement: 'bottom-start', gap: 6 },
        },
      }),
    ],
  )
}
