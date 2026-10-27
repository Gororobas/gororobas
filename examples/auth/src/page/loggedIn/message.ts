import { defineMessageUnion } from 'foldkit/message'

export const Message = defineMessageUnion({
  ClickedLogout: {},
})

export const OutMessage = defineMessageUnion({
  RequestedLogout: {},
})
