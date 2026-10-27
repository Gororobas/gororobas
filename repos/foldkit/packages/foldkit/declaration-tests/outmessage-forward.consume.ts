import type { Block } from 'foldkit'

import {
  ChildOutMessage,
  ParentOutMessage,
  forwardChildOutMessage,
} from './outmessage-forward.accepted.js'

type Equal<Left, Right> =
  (<Value>() => Value extends Left ? 1 : 2) extends <
    Value,
  >() => Value extends Right ? 1 : 2
    ? true
    : false
type Expect<Value extends true> = Value

export type EmittedForward = readonly [
  Expect<
    Equal<
      typeof forwardChildOutMessage,
      Block.OutMessageForward<
        typeof ChildOutMessage.Type,
        typeof ParentOutMessage.Type
      >
    >
  >,
  Expect<
    Equal<
      ReturnType<typeof forwardChildOutMessage>,
      typeof ParentOutMessage.Type | undefined
    >
  >,
]

forwardChildOutMessage(ChildOutMessage.Selected({ value: 'Apple' }))
