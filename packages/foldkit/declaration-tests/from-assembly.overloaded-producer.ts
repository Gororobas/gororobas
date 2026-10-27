import { Block } from 'foldkit'

import { Model } from './from-assembly.accepted.js'
import { prepareViewed } from './from-assembly.accepted.js'
import type { Assert, Equal } from './from-assembly.assertions.js'

declare function overloadedAssembly(): any
declare function overloadedAssembly(
  ...args: ReadonlyArray<never>
): ReturnType<typeof prepareViewed>

export const selectedResult = overloadedAssembly()
export type SelectedResultIsAny = Assert<Equal<typeof selectedResult, any>>
export type LastOverloadReturnsBlock = Assert<
  Equal<ReturnType<typeof overloadedAssembly>, ReturnType<typeof prepareViewed>>
>

export const OverloadedAnnotation: Block.FromAssemblyWithView<
  typeof Model,
  // @ts-expect-error A valid last overload must not hide an any-producing selected overload.
  typeof overloadedAssembly
> = overloadedAssembly()

declare function overloadedWithNever(): any
declare function overloadedWithNever(): never
declare function overloadedWithNever(
  ...args: ReadonlyArray<never>
): ReturnType<typeof prepareViewed>

export const selectedNeverOverloadResult = overloadedWithNever()
export type SelectedNeverOverloadResultIsAny = Assert<
  Equal<typeof selectedNeverOverloadResult, any>
>
export type LastNeverOverloadReturnsBlock = Assert<
  Equal<
    ReturnType<typeof overloadedWithNever>,
    ReturnType<typeof prepareViewed>
  >
>

export const OverloadedWithNeverAnnotation: Block.FromAssemblyWithView<
  typeof Model,
  // @ts-expect-error A middle never-returning overload cannot satisfy the producer guard for an unsafe selected overload.
  typeof overloadedWithNever
> = overloadedWithNever()

declare function sameArityAssembly(): any
declare function sameArityAssembly(): ReturnType<typeof prepareViewed>

export const sameAritySelectedResult = sameArityAssembly()
export type SameAritySelectedResultIsAny = Assert<
  Equal<typeof sameAritySelectedResult, any>
>
export type SameArityLastOverloadReturnsBlock = Assert<
  Equal<ReturnType<typeof sameArityAssembly>, ReturnType<typeof prepareViewed>>
>

export const SameArityAnnotation: Block.FromAssemblyWithView<
  typeof Model,
  // @ts-expect-error Identical zero-argument signatures cannot hide an any-producing selected overload.
  typeof sameArityAssembly
> = sameArityAssembly()
export const SameArityCarrier: Block.AssemblyWithView<
  typeof Model,
  // @ts-expect-error The declaration support interface rejects the same zero-argument overload set.
  typeof sameArityAssembly
> = sameArityAssembly()

declare function sameArityWithNever(): any
declare function sameArityWithNever(): never
declare function sameArityWithNever(): ReturnType<typeof prepareViewed>

export const sameArityNeverSelectedResult = sameArityWithNever()
export type SameArityNeverSelectedResultIsAny = Assert<
  Equal<typeof sameArityNeverSelectedResult, any>
>
export type SameArityNeverLastOverloadReturnsBlock = Assert<
  Equal<ReturnType<typeof sameArityWithNever>, ReturnType<typeof prepareViewed>>
>

export const SameArityNeverAnnotation: Block.FromAssemblyWithView<
  typeof Model,
  // @ts-expect-error A zero-argument never middle signature cannot bypass the complete-producer guard.
  typeof sameArityWithNever
> = sameArityWithNever()
export const SameArityNeverCarrier: Block.AssemblyWithView<
  typeof Model,
  // @ts-expect-error The declaration support interface rejects the same three zero-argument signatures.
  typeof sameArityWithNever
> = sameArityWithNever()
