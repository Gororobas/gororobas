import { defineMessageUnion } from 'foldkit/message'

import { Session } from '../../domain/session'
export const Message = defineMessageUnion({})

export const OutMessage = defineMessageUnion({
  SucceededLogin: { session: Session },
})
