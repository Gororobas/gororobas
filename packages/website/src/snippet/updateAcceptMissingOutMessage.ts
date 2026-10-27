const plainUpdate: Update.Return<typeof Model.Type, Message> = { model }

const blockUpdate: Update.ReturnWithOutMessage<
  typeof Model.Type,
  Message,
  OutMessage
> = plainUpdate
