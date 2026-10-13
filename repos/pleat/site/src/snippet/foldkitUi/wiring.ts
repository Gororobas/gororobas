import { Option, Schema } from 'effect'
import { Update } from 'foldkit'
import type { Html, HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import { modifyFields } from 'foldkit/struct'

import { Menu } from '@foldkit/ui'
import { cssClass } from '@pleat/foldkit'

import { optionItem, panel, triggerButton } from './kit.ts'

const Action = Schema.Literals(['Rename', 'Archive'])
type Action = typeof Action.Type

const ActionMenu: Menu.Bundle<Action> = Menu.create<Action>()

// MODEL AND MESSAGE

export const Model = Schema.Struct({
  menu: Menu.Model,
  maybeAction: Schema.Option(Action),
})
export type Model = typeof Model.Type

export const Message = defineMessageUnion({
  GotMenuMessage: { message: Menu.Message },
})
export type Message = typeof Message.Type

export const init = (): Model => ({
  menu: Menu.init({ id: 'actions', isAnimated: true }),
  maybeAction: Option.none(),
})

// UPDATE

const foldMenu = Update.foldChild({
  update: ActionMenu.update,
  read: (model: Model) => Option.some(model.menu),
  write: (model, menu) => modifyFields(model, { menu: () => menu }),
  toParentMessage: message => Message.GotMenuMessage({ message }),
  foldOutMessage:
    ({ value }) =>
    model => ({
      model: modifyFields(model, {
        maybeAction: () => Option.some(value),
      }),
    }),
})

export const update = (
  model: Model,
  message: Message,
): Update.Return<Model, Message> =>
  Message.match(message, {
    GotMenuMessage: ({ message }) => foldMenu(model, message),
  })

// VIEW

// Pleat appears only here: class names for the parts, with every state
// (open, highlighted, disabled, closed) handled inside the styles.
export const view = (model: Model, h: HtmlBuilder<Message>): Html =>
  h.submodel({
    slotId: 'actions',
    model: model.menu,
    view: ActionMenu.view,
    toParentMessage: message => Message.GotMenuMessage({ message }),
    viewInputs: {
      items: Action.literals,
      buttonContent: h.span([], ['Actions']),
      buttonClassName: cssClass(triggerButton),
      itemsClassName: cssClass(panel),
      itemToConfig: action => ({
        className: cssClass(optionItem({})),
        content: h.span([], [action]),
      }),
    },
  })
