import {
  ChildBlock,
  DefinitionWithoutOutMessage,
  ForeignOutMessage,
  ParentDefinition,
  ParentOutMessage,
} from './outmessage-forward.accepted.js'

// @ts-expect-error A Definition without an OutMessage contract cannot author forwarding.
DefinitionWithoutOutMessage.makeOutMessageForward(ChildBlock, {})

// @ts-expect-error All named child OutMessage variants are required.
ParentDefinition.makeOutMessageForward(ChildBlock, {
  Selected: ({ value }) => ParentOutMessage.Chose({ value }),
})

ParentDefinition.makeOutMessageForward(ChildBlock, {
  Selected: ({ value }) => ParentOutMessage.Chose({ value }),
  Closed: () => undefined,
  // @ts-expect-error Undeclared child OutMessage variants are rejected.
  Unexpected: () => undefined,
})

ParentDefinition.makeOutMessageForward(ChildBlock, {
  // @ts-expect-error A foreign OutMessage cannot enter the parent channel.
  Selected: () => ForeignOutMessage.Escaped(),
  Closed: () => undefined,
})

// @ts-expect-error A forwarding policy must forward at least one parent OutMessage.
// oxlint-disable-next-line foldkit/no-empty-to-parent-out-message -- This fixture verifies TypeScript rejects an empty forwarding policy.
ParentDefinition.makeOutMessageForward(ChildBlock, {
  Selected: () => undefined,
  Closed: () => undefined,
})

ParentDefinition.makeOutMessageForward(ChildBlock, {
  // @ts-expect-error `any` cannot bypass the parent OutMessage contract.
  Selected: (): any => ParentOutMessage.Dismissed(),
  Closed: () => undefined,
})

ParentDefinition.makeOutMessageForward(ChildBlock, {
  // @ts-expect-error `unknown` cannot bypass the parent OutMessage contract.
  Selected: (): unknown => ParentOutMessage.Dismissed(),
  Closed: () => undefined,
})

ParentDefinition.makeOutMessageForward(ChildBlock, {
  // @ts-expect-error `never` cannot bypass the parent OutMessage contract.
  Selected: (): never => {
    throw new Error('unreachable')
  },
  Closed: () => ParentOutMessage.Dismissed(),
})
