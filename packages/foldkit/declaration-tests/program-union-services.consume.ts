import type { Layer } from 'effect'
import { Program } from 'foldkit'

import {
  AnnotatedRegisteredBlock,
  AnnotatedUnregisteredBlock,
  KeyedRegisteredBlock,
  type KeyedSessionService,
  type SessionService,
  Store,
  StoreLayer,
  makeDifferentPlacementProgram,
  makeKeyedResourceUnionProgram,
  makeRegisteredUnionProgram,
  makeResourceUnionProgram,
  makeStoreUnionProgram,
} from './program-union-services.accepted.js'

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
type RequirementsOf<ProgramValue> =
  ProgramValue extends Readonly<{
    '~foldkit/ProgramProvision'?: Readonly<{
      Requirements: (requirements: infer Requirements) => unknown
    }>
  }>
    ? Requirements
    : never
type RuntimeServicesOf<ProgramValue> =
  ProgramValue extends Readonly<{
    '~foldkit/ProgramProvision'?: Readonly<{
      RuntimeServices: (services: infer Services) => unknown
    }>
  }>
    ? Services
    : never

export type ExactResourceRequirement = Expect<
  Equal<
    RequirementsOf<ReturnType<typeof makeResourceUnionProgram>>,
    SessionService
  >
>
export type ExactResourceGuarantee = Expect<
  Equal<RuntimeServicesOf<ReturnType<typeof makeResourceUnionProgram>>, never>
>
export type ExactRegisteredRequirement = Expect<
  Equal<RequirementsOf<ReturnType<typeof makeRegisteredUnionProgram>>, never>
>
export type ExactRegisteredGuarantee = Expect<
  Equal<
    RuntimeServicesOf<ReturnType<typeof makeRegisteredUnionProgram>>,
    SessionService
  >
>
export type ExactKeyedRequirement = Expect<
  Equal<
    RequirementsOf<ReturnType<typeof makeKeyedResourceUnionProgram>>,
    KeyedSessionService
  >
>
export type ExactKeyedGuarantee = Expect<
  Equal<
    RuntimeServicesOf<ReturnType<typeof makeKeyedResourceUnionProgram>>,
    never
  >
>
export type ExactDifferentPlacementRequirement = Expect<
  Equal<
    RequirementsOf<ReturnType<typeof makeDifferentPlacementProgram>>,
    KeyedSessionService
  >
>
export type ExactDifferentPlacementGuarantee = Expect<
  Equal<
    RuntimeServicesOf<ReturnType<typeof makeDifferentPlacementProgram>>,
    never
  >
>
export type ExactOrdinaryStoreRequirement = Expect<
  Equal<RequirementsOf<ReturnType<typeof makeStoreUnionProgram>>, Store>
>

export const startKeyedSingleton = (
  layer: Layer.Layer<never, never, KeyedSessionService>,
) =>
  Program.makeElement({ block: KeyedRegisteredBlock, container: null }).provide(
    layer,
  ).start

export const startAnnotatedUnionWithProvider = (
  block: typeof AnnotatedRegisteredBlock | typeof AnnotatedUnregisteredBlock,
  layer: Layer.Layer<SessionService>,
) => Program.makeElement({ block, container: null }).provide(layer).start

export const startOrdinaryStoreUnion = (
  block: Parameters<typeof makeStoreUnionProgram>[0],
) => makeStoreUnionProgram(block).provide(StoreLayer).start
