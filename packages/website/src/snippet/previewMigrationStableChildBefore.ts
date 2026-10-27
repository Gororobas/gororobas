// Stable Before: the parent owns the wrapper Message and child fold.
import { Option, Schema } from 'effect'
import { Update } from 'foldkit'
import { defineMessageUnion } from 'foldkit/message'
import { modifyFields } from 'foldkit/struct'

import * as Settings from './settings'

export const Model = Schema.Struct({ settings: Settings.Model })
export type Model = typeof Model.Type

export const Message = defineMessageUnion({
  ClickedHelp: {},
  GotSettingsMessage: { message: Settings.Message },
})
export type Message = typeof Message.Type

const foldSettings = Update.foldChild({
  update: Settings.update,
  read: (model: Model) => Option.some(model.settings),
  write: (model, nextSettings) =>
    modifyFields(model, { settings: () => nextSettings }),
  toParentMessage: message => Message.GotSettingsMessage({ message }),
})

export const update = (model: Model, message: Message) =>
  Message.match<Update.Return<Model, Message>>(message, {
    ClickedHelp: () => ({ model }),
    GotSettingsMessage: ({ message }) => foldSettings(model, message),
  })
