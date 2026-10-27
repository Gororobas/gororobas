import type { Layer } from 'effect'
import type { Block, Command, Update } from 'foldkit'

import {
  ConstructorFailure,
  ConstructorService,
  ElementProgram,
  Headless,
  HostBlock,
  HostSave,
  Model,
  NumericChoice,
  OutMessage,
  PageBlock,
  PageProgram,
  ProvidedHostBlock,
  ReportingHeadless,
  ReportingViewed,
  SaveCount,
  Viewed,
  ViewedBinding,
  ViewedDraft,
  prepareViewed,
  renderPage,
} from './mandatory-completion.accepted.js'

type Equal<Left, Right> =
  (<Value>() => Value extends Left ? 1 : 2) extends <
    Value,
  >() => Value extends Right ? 1 : 2
    ? (<Value>() => Value extends Right ? 1 : 2) extends <
        Value,
      >() => Value extends Left ? 1 : 2
      ? true
      : false
    : false
type Expect<Value extends true> = Value

export type ExactModel = Expect<Equal<typeof Viewed.Model, typeof Model>>
export type ExactOperationRequirements = Expect<
  Equal<
    Update.RequirementsOf<typeof Viewed.operations.setCount>,
    Command.HandlerOf<typeof SaveCount>
  >
>
export type ExactServices = Expect<
  Equal<Layer.Services<typeof Viewed.EffectsLayer>, ConstructorService>
>
export type ExactConstructorError = Expect<
  Equal<Layer.Error<typeof Viewed.EffectsLayer>, ConstructorFailure>
>
export type ExactReportingViewedOutMessage = Expect<
  Equal<typeof ReportingViewed.OutMessage, typeof OutMessage>
>
export type ExactReportingHeadlessOutMessage = Expect<
  Equal<typeof ReportingHeadless.OutMessage, typeof OutMessage>
>
export type ViewedHasNoOutMessage = Expect<
  Equal<typeof Viewed.OutMessage, undefined>
>
export type HeadlessHasNoOutMessage = Expect<
  Equal<typeof Headless.OutMessage, undefined>
>
export type ExactHostHandlers = Expect<
  Equal<typeof HostBlock.hostHandlers, readonly [typeof HostSave]>
>
export type ProvidedHostHandlers = Expect<
  Equal<typeof ProvidedHostBlock.hostHandlers, readonly []>
>
export type ProvidedHostServices = Expect<
  Equal<Layer.Services<typeof ProvidedHostBlock.EffectsLayer>, never>
>
export type GenericDecodedModel = Expect<
  Equal<typeof NumericChoice.Model.Type, Readonly<{ selected: number }>>
>
export type GenericEncodedModel = Expect<
  Equal<typeof NumericChoice.Model.Encoded, Readonly<{ selected: string }>>
>

export const DraftIsOpaque: Block.AssemblyDraft<object> = ViewedDraft
export const FinishedBlock: Block.AnyBlock = Viewed
export const FinishedBinding = ViewedBinding
export const FinishedElementProgram = ElementProgram
export const FinishedPageProgram = PageProgram
export const FinishedPage = PageBlock
export const FinishedRender = renderPage

Viewed.operations.setCount(Model.make({ count: 0 }), { count: 1 })
NumericChoice.operations.select({ selected: 1 }, { selected: 2 })

// @ts-expect-error The emitted draft remains unavailable as a completed Block.
export const EmittedDraftAsBlock: Block.AnyBlock = ViewedDraft

// @ts-expect-error The emitted producer remains unavailable as a completed Block.
export const EmittedProducerAsBlock: Block.AnyBlock = prepareViewed
