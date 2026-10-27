export type Model = Readonly<{ value: string }>
export type Message = Readonly<{ type: 'Changed' }>

export const update = (model: Model, _message: Message) => ({
  model,
})

export const close = (model: Model) => ({
  model,
  outMessage: { type: 'Closed' },
})
