import { Effect } from 'effect'
import { Runtime } from 'foldkit'
import type * as Block from 'foldkit/block'
import * as Scene from 'foldkit/scene'
import * as Update from 'foldkit/update'

import {
  ApplicationComposition,
  ChildBinding,
  ChildMessage,
  GeneratedDispatchChildBlock,
  GeneratedDispatchParentBlock,
  ParentMessage,
  init,
  parentUpdate,
  providedElement,
  sceneSubscriptions,
  update,
  view,
} from './generated-dispatch.accepted.js'

type Equal<Left, Right> =
  (<Value>() => Value extends Left ? 1 : 2) extends <
    Value,
  >() => Value extends Right ? 1 : 2
    ? true
    : false
type Expect<Value extends true> = Value

export type ExactOperationArguments = Expect<
  Equal<
    Parameters<typeof ChildBinding.requestSetCount>,
    [...Block.OperationParameters<typeof ChildMessage.RequestedSetCount>]
  >
>
export type ExactChildDispatch = Expect<
  Equal<
    typeof GeneratedDispatchChildBlock.Message.Type,
    typeof ChildMessage.Type
  >
>
export type ExactParentLocalFacts = Expect<
  Equal<(typeof ParentMessage.Type)['_tag'], 'ChangedTitle'>
>
export type ParentReceivesGeneratedDelivery = Expect<
  Equal<
    Parameters<typeof parentUpdate>[1],
    typeof GeneratedDispatchParentBlock.Message.Type
  >
>
export type ApplicationReceivesNestedDispatch = Expect<
  Equal<
    Parameters<typeof update>[1],
    typeof ApplicationComposition.Message.Type
  >
>
export type InitializationKeepsRequirements = Expect<
  Equal<
    Update.RequirementsOf<typeof init>,
    Update.RequirementsOf<typeof update>
  >
>

export const embedded = Runtime.embed(providedElement)
export const changedTitle = GeneratedDispatchParentBlock.Message.ChangedTitle({
  title: 'Counts',
})
// @ts-expect-error Derived dispatch keeps precise local constructor payloads.
GeneratedDispatchParentBlock.Message.ChangedTitle({ title: 1 })
// @ts-expect-error Generated delivery is not a callable local fact.
GeneratedDispatchParentBlock.Message.GotChildMessage
export const simulateRelocatedSubscriptions = () =>
  Scene.scene(
    {
      update,
      view,
      subscriptions: Scene.subscriptions(ApplicationComposition),
    },
    Scene.given(init().model),
    Scene.Subscription.emit(
      sceneSubscriptions['parent/child/observations'],
      ChildMessage.ObservedCount({ count: 1 }),
    ),
  )
export type ProvidedRuntimeIsRunnable = Expect<
  Equal<Effect.Services<typeof embedded>, never>
>

// @ts-expect-error Relocated declarations preserve the operation payload.
ChildBinding.requestSetCount({ count: 'invalid' })
