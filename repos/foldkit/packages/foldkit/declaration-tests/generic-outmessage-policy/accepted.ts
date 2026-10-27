import type { Layer } from 'effect'
import type { Block, Command, Update } from 'foldkit'

import type { Assert, Equal } from './assertions.js'
import { City, CityFeature, RootBlock, selected } from './consumer.js'
import { SelectionStore } from './contracts.js'

export type RefinedSelectionPayload = Assert<
  Equal<
    Parameters<typeof CityFeature.block.operations.select>[1]['value'],
    typeof City.Type
  >
>
export type RefinedChildOutMessage = Assert<
  Equal<
    Extract<
      typeof CityFeature.SelectionBlock.OutMessage.Type,
      { _tag: 'Selected' }
    >['value'],
    typeof City.Type
  >
>
export type InferredParentOutMessage = Assert<
  Equal<
    Exclude<typeof selected.outMessage, undefined>,
    typeof CityFeature.OutMessage.Type
  >
>
export type InferredParentOutMessagePayload = Assert<
  Equal<
    Exclude<typeof selected.outMessage, undefined>['value'],
    typeof City.Type
  >
>
export type InferredParentUpdateOutMessage = Assert<
  Equal<
    Exclude<
      ReturnType<typeof CityFeature.block.update>['outMessage'],
      undefined
    >,
    typeof CityFeature.OutMessage.Type
  >
>
export type ParentPolicyHandler = Assert<
  Equal<
    Update.RequirementsOf<
      ReturnType<typeof CityFeature.foldSelectionOutMessage>
    >,
    Command.HandlerOf<typeof CityFeature.RecordSelection>
  >
>
export type ParentUpdateHandler = Assert<
  Equal<
    Update.RequirementsOf<typeof CityFeature.block.update>,
    Command.HandlerOf<typeof CityFeature.RecordSelection>
  >
>
export type ParentOperationHandler = Assert<
  Equal<
    Update.RequirementsOf<typeof CityFeature.block.operations.select>,
    Command.HandlerOf<typeof CityFeature.RecordSelection>
  >
>
export type ParentOrdinaryServices = Assert<
  Equal<Layer.Services<typeof CityFeature.block.EffectsLayer>, SelectionStore>
>
export type RootOrdinaryServices = Assert<
  Equal<Layer.Services<typeof RootBlock.EffectsLayer>, SelectionStore>
>
export type ExactPolicyRegistration = Assert<
  Equal<
    Update.RegistrationEvidenceOf<
      ReturnType<ReturnType<typeof CityFeature.foldSelectionOutMessage>>
    >,
    Block.RequirementOfBinding<typeof CityFeature.HistoryBinding>
  >
>
export type ExactChildTuple = Assert<
  Equal<
    typeof CityFeature.block.bindings,
    readonly [
      typeof CityFeature.SelectionBinding,
      typeof CityFeature.HistoryBinding,
    ]
  >
>
export type ExactPolicyForwardPayload = Assert<
  Equal<
    Exclude<
      ReturnType<typeof CityFeature.forwardSelectionOutMessage>,
      undefined
    >,
    typeof CityFeature.OutMessage.Type
  >
>

export const refinedValue = (outMessage: typeof CityFeature.OutMessage.Type) =>
  CityFeature.OutMessage.match(outMessage, {
    ChoseItem: ({ value }) => value,
  })

export type RefinedMatcherPayload = Assert<
  Equal<ReturnType<typeof refinedValue>, typeof City.Type>
>
