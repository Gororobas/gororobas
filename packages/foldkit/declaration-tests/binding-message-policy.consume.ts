import { Schema } from 'effect'

import {
  BindingMessagePolicyParentComposition,
  ChildMessage,
  ChildModel,
  ContextBinding,
  ContextChildBlock,
  type DispatchContext,
  KeyedBinding,
  SilentChildBlock,
} from './binding-message-policy.accepted.js'

type Equal<Left, Right> =
  (<Value>() => Value extends Left ? 1 : 2) extends <
    Value,
  >() => Value extends Right ? 1 : 2
    ? true
    : false
type Expect<Value extends true> = Value

export type ContextUpdateArguments = Expect<
  Equal<
    Parameters<typeof ContextChildBlock.update>,
    [
      model: typeof ChildModel.Type,
      message: typeof ChildMessage.Type,
      context: DispatchContext,
    ]
  >
>
export type SilentUpdateArguments = Expect<
  Equal<
    Parameters<typeof SilentChildBlock.update>,
    [model: typeof ChildModel.Type, message: never]
  >
>
export type ContextFoldArguments = Expect<
  Equal<
    Parameters<typeof ContextBinding.fold>,
    [
      model: Parameters<typeof ContextBinding.fold>[0],
      message: typeof ChildMessage.Type,
      context: DispatchContext,
    ]
  >
>
export type KeyedFoldKey = Expect<
  Equal<Parameters<typeof KeyedBinding.fold>[1], string>
>
export type ContextGeneratedMessage = Expect<
  Equal<
    Extract<
      typeof BindingMessagePolicyParentComposition.Message.Type,
      Readonly<{ placement: 'child' }>
    >,
    Readonly<{
      _tag: 'GotChildMessage'
      placement: 'child'
      generation: number
      message: typeof ChildMessage.Type
    }>
  >
>
export type KeyedGeneratedMessage = Expect<
  Equal<
    Extract<
      typeof BindingMessagePolicyParentComposition.Message.Type,
      Readonly<{ placement: 'entries' }>
    >,
    Readonly<{
      _tag: 'GotEntriesMessage'
      placement: 'entries'
      generation: number
      key: string
      message: typeof ChildMessage.Type
    }>
  >
>

Schema.decodeSync(BindingMessagePolicyParentComposition.Message)({
  _tag: 'GotEntriesMessage',
  placement: 'entries',
  generation: 0,
  key: 'entry',
  message: ChildMessage.ChangedValue({ value: 'next' }),
})
