import { Schema } from 'effect'

import * as Ui from '@foldkit/ui'

/** Payload shape for the showcase's toast stack. Consumer decides what goes
 *  in each entry; the Toast component owns only lifecycle and a11y. */
export const ToastPayload = Schema.Struct({
  title: Schema.String,
  maybeDescription: Schema.Option(Schema.String),
})

export const ToastBlock = Ui.Toast.make(ToastPayload)
