import {
  BindingMessagePolicyParentDefinition,
  ContextChildBlock,
  ParentMessage,
  SilentChildBlock,
} from './binding-message-policy.accepted.js'

// @ts-expect-error Parent Message wrappers are generated from the Binding placement.
BindingMessagePolicyParentDefinition.makeBinding(ContextChildBlock, {
  field: 'child',
  toParentMessage: () => ParentMessage.ClickedSave(),
  delivery: { toUpdateContext: () => [{ roomId: 'room' }] },
})

// @ts-expect-error Parent Message wrappers are generated from the Binding placement.
BindingMessagePolicyParentDefinition.makeBinding(ContextChildBlock, {
  field: 'child',
  fromParentMessage: false,
  delivery: { toUpdateContext: () => [{ roomId: 'room' }] },
})

BindingMessagePolicyParentDefinition.makeBinding(ContextChildBlock, {
  // @ts-expect-error Generated delivery must return the child's exact extra update arguments.
  field: 'child',
  // @ts-expect-error Generated delivery must return the child's exact extra update arguments.
  delivery: { toUpdateContext: () => [] },
})

BindingMessagePolicyParentDefinition.makeBinding(SilentChildBlock, {
  // @ts-expect-error A Message-free child cannot configure generated delivery.
  field: 'silent',
  // @ts-expect-error A Message-free child cannot configure generated delivery.
  delivery: {},
})
