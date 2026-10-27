import type { Layer } from 'effect'
import type { Command, Update } from 'foldkit'

import {
  ChildBinding,
  ComposedInitBlock,
  init,
} from './composed-init.accepted.js'
import {
  ChildBlock,
  ChildOutMessage,
  ContextBlock,
  ContextModel,
  FruitChoice,
  FruitChoiceResult,
  ProvidedFruitChoice,
  RecordValue,
  type RequiredContext,
  makeChoice,
} from './exposed-message.accepted.js'
import type { Assert, Equal, SameMembers } from './from-assembly.assertions.js'
import { RawRootBlock, RootBlock } from './from-assembly.lifecycle.js'
import {
  CountStore,
  GeneratedDispatchParentBlock,
  PreparationFailure,
  RawGeneratedDispatchParentBlock,
  ReadCount,
  childInit,
} from './generated-dispatch.accepted.js'

export type ConstructorError = Assert<
  Equal<
    Layer.Error<typeof GeneratedDispatchParentBlock.EffectsLayer>,
    PreparationFailure
  >
>
export type OrdinaryService = Assert<
  Equal<
    Layer.Services<typeof GeneratedDispatchParentBlock.EffectsLayer>,
    CountStore
  >
>
export type OutputServices = Assert<
  Equal<
    Layer.Success<typeof GeneratedDispatchParentBlock.EffectsLayer>,
    Layer.Success<typeof RawGeneratedDispatchParentBlock.EffectsLayer>
  >
>
export type ChildCommandRequirements = Assert<
  Equal<
    Update.RequirementsOf<typeof childInit>,
    Command.HandlerOf<typeof ReadCount>
  >
>
export type InitializationArguments = Assert<
  Equal<Parameters<typeof ComposedInitBlock.init>, [isReady: boolean]>
>
export type InitializationRegistration = Assert<
  Equal<
    Update.RegistrationEvidenceOf<ReturnType<typeof init>>,
    Update.RegistrationEvidenceOf<
      ReturnType<ReturnType<typeof ChildBinding.requestReadCount>>
    >
  >
>
export type ContextArguments = Assert<
  Equal<
    Parameters<typeof ContextBlock.operations.setRequired>,
    [model: typeof ContextModel.Type, value: string, required: RequiredContext]
  >
>
export type HostCommandRequirement = Assert<
  Equal<
    Update.RequirementsOf<typeof ChildBlock.operations.setValue>,
    Command.HandlerOf<typeof RecordValue>
  >
>
export type OutMessageSchema = Assert<
  Equal<typeof ChildBlock.OutMessage.Type, ChildOutMessage>
>
export type HostHandlers = Assert<
  Equal<
    typeof FruitChoice.hostHandlers,
    readonly [typeof FruitChoiceResult.Observe]
  >
>
export type ProvidedHostHandlers = Assert<
  Equal<typeof ProvidedFruitChoice.hostHandlers, readonly []>
>
export type LifecycleMembers = Assert<
  SameMembers<typeof RootBlock, typeof RawRootBlock>
>
export type SubscriptionKeys = Assert<
  Equal<keyof typeof RootBlock.subscriptions, 'work'>
>
export type ManagedResourceKeys = Assert<
  Equal<keyof typeof RootBlock.managedResources, 'resource'>
>

export const DownstreamChoice = makeChoice(['Small', 'Large'])
export type RefinedFactoryMembers = Assert<
  SameMembers<typeof DownstreamChoice.block, typeof DownstreamChoice.rawBlock>
>
DownstreamChoice.block.operations.select({ selected: 'Small' }, 'Large', {
  source: 'consumer',
})
// @ts-expect-error The emitted factory retains its refined operation payload.
DownstreamChoice.block.operations.select({ selected: 'Small' }, 'Unknown', {
  source: 'consumer',
})
// @ts-expect-error The emitted operation retains required per-dispatch context.
DownstreamChoice.block.operations.select({ selected: 'Small' }, 'Large')
// @ts-expect-error The emitted initializer keeps the refined input argument.
DownstreamChoice.block.init('Unknown')
