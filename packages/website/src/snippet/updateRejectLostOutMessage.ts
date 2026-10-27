const childUpdate: Update.ReturnWithOutMessage<
  typeof Child.ChildBlock.Model.Type,
  typeof Child.ChildBlock.Message.Type,
  typeof Child.ChildBlock.OutMessage.Type
> = Child.ChildBlock.update(model.child, message)

// Type error: childUpdate may contain an OutMessage that this type cannot hold.
const plainChildUpdate: Update.Return<
  typeof Child.ChildBlock.Model.Type,
  typeof Child.ChildBlock.Message.Type
> = childUpdate
