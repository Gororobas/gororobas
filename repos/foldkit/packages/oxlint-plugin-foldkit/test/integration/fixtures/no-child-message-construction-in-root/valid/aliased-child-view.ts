import { Block } from 'foldkit'

import { Child } from './child'

const save = Child.Message.ClickedChildViewSave

const AliasedChildViewNamespace = Block.makeNamespace('AliasedChildView')
const childView = AliasedChildViewNamespace.makeDefinition({
  Model: Child.Model,
  Message: Child.Message,
})

const AliasedChildViewComposition = childView.makeComposition()

export const view = AliasedChildViewComposition.makeView((_model, h) =>
  h.button([h.OnClick(save())]),
)
