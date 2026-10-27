import { Layer } from 'effect'

import {
  type EmptyRegistryLayer,
  type ExactLayerProof,
  type RegistryLayer,
  aggregated,
  lifted,
  registryBlock,
} from './subscription-registry.accepted.js'

type Equal<Left, Right> =
  (<Value>() => Value extends Left ? 1 : 2) extends <
    Value,
  >() => Value extends Right ? 1 : 2
    ? true
    : false
type Expect<Value extends true> = Value

export type AggregateLayerIsExact = Expect<
  Equal<RegistryLayer, ExactLayerProof>
>
export type EmptyLayerIsExact = Expect<
  Equal<EmptyRegistryLayer, Layer.Layer<never>>
>
export type AggregateKeysAreEntries = Expect<
  Equal<keyof typeof aggregated, 'clock' | 'logger'>
>
export type LiftedKeysAreEntries = Expect<
  Equal<keyof typeof lifted, 'clock' | 'logger'>
>
export type BlockKeysAreEntries = Expect<
  Equal<keyof typeof registryBlock.subscriptions, 'clock' | 'logger'>
>
