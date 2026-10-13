import { Option } from 'effect'
import type { Html, HtmlBuilder } from 'foldkit/html'

import { css, cssClass } from '@pleat/foldkit'

import {
  type Action,
  ActionMenu,
  Message,
  type Model,
} from '../../demo/foldkitUi.ts'
import {
  chevron,
  cluster,
  hint,
  optionItem,
  panel,
  separator,
  spread,
  triggerButton,
} from './kit.ts'

const ACTIONS: ReadonlyArray<Action> = [
  'Rename',
  'Duplicate',
  'Share',
  'Archive',
  'Delete',
]

// Menu takes class names for its parts, and an item has no attributes
// field, so these use cssClass where other components use css.
export const menuDemo = (
  model: Model,
  h: HtmlBuilder<Message>,
): Html =>
  h.div(
    [...css(cluster)],
    [
      h.submodel({
        slotId: 'ui-menu',
        model: model.menu,
        view: ActionMenu.view,
        toParentMessage: message =>
          Message.GotMenuMessage({ message }),
        viewInputs: {
          items: ACTIONS,
          isItemDisabled: action => action === 'Share',
          itemGroupKey: action =>
            action === 'Delete' ? 'Danger' : 'Safe',
          buttonContent: h.span(
            [...css(spread)],
            ['Actions', h.span([...css(chevron)])],
          ),
          buttonClassName: cssClass(triggerButton),
          itemsClassName: cssClass(panel),
          separatorClassName: cssClass(separator),
          itemToConfig: action => ({
            className: cssClass(
              optionItem({
                tone: action === 'Delete' ? 'Danger' : 'Default',
              }),
            ),
            content: h.span([], [action]),
          }),
          anchor: { placement: 'bottom-start', gap: 6 },
        },
      }),
      h.span(
        [...css(hint)],
        [
          Option.match(model.maybeAction, {
            onNone: () => 'Nothing chosen yet.',
            onSome: action => `Last chose ${action}.`,
          }),
        ],
      ),
    ],
  )
