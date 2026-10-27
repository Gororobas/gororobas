import { Predicate } from 'effect'

import { generatedDeliveryOf } from '../block/childEnvelope.js'
import { runtimeBindingsOf } from '../block/composition.js'
import type { ActiveInstance, InstanceKey } from '../block/instanceContext.js'

type GeneratedDelivery = NonNullable<ReturnType<typeof generatedDeliveryOf>>

type GeneratedEnvelope = Readonly<{
  _tag: string
  placement: string
  generation: number
  key?: InstanceKey
  message: unknown
}>

type Occurrence = Pick<
  ActiveInstance,
  'binding' | 'generation' | 'isActive' | 'key'
>

type RuntimeOccurrence = Omit<ActiveInstance, 'children'> &
  Readonly<{
    block: { bindings: ReadonlyArray<object> }
    children: Map<object, Map<InstanceKey | undefined, RuntimeOccurrence>>
  }>

const generatedDeliveryFor = (
  occurrence: Occurrence,
): GeneratedDelivery | undefined =>
  occurrence.binding === undefined
    ? undefined
    : generatedDeliveryOf(occurrence.binding)

const requireSerializableGeneration = (
  occurrence: Occurrence,
  syntheticGeneration?: 0,
): number => {
  if (occurrence.generation >= 0) {
    return occurrence.generation
  }
  if (syntheticGeneration !== undefined) {
    return syntheticGeneration
  }
  throw new Error(
    '[foldkit] A historical child occurrence cannot emit a live Message. Scene replay must use its synthetic generation.',
  )
}

const makeEnvelope = (
  occurrence: Occurrence,
  delivery: GeneratedDelivery,
  message: unknown,
  syntheticGeneration?: 0,
): GeneratedEnvelope => {
  if (delivery.isKeyed && occurrence.key === undefined) {
    throw new Error(
      `[foldkit] Generated child placement "${delivery.placement}" requires an occurrence key.`,
    )
  }

  return {
    _tag: delivery.tag,
    placement: delivery.placement,
    generation: requireSerializableGeneration(occurrence, syntheticGeneration),
    ...(delivery.isKeyed ? { key: occurrence.key } : {}),
    message,
  }
}

/** @internal Lifts one emission through its captured occurrence boundary. */
export const liftChildMessage = (
  occurrence: Occurrence,
  message: unknown,
  legacyLift: (message: unknown) => unknown,
  syntheticGeneration?: 0,
): unknown => {
  const delivery = generatedDeliveryFor(occurrence)
  return delivery === undefined
    ? legacyLift(message)
    : makeEnvelope(occurrence, delivery, message, syntheticGeneration)
}

const requireEnvelope = (
  message: unknown,
  occurrence: Occurrence,
  delivery: GeneratedDelivery,
): GeneratedEnvelope => {
  if (
    !Predicate.isObject(message) ||
    Reflect.get(message, '_tag') !== delivery.tag ||
    Reflect.get(message, 'placement') !== delivery.placement ||
    Reflect.get(message, 'generation') !== 0 ||
    !Object.hasOwn(message, 'message') ||
    (delivery.isKeyed
      ? !Object.hasOwn(message, 'key') ||
        Reflect.get(message, 'key') !== occurrence.key
      : Object.hasOwn(message, 'key'))
  ) {
    throw new Error(
      `[foldkit] A generated Command result for placement "${delivery.placement}" did not contain its expected child Message envelope.`,
    )
  }

  /* eslint-disable-next-line @typescript-eslint/consistent-type-assertions */
  return message as GeneratedEnvelope
}

const stampEnvelopeChain = (
  message: unknown,
  occurrences: ReadonlyArray<Occurrence>,
  deliveries: ReadonlyArray<GeneratedDelivery>,
  index: number,
): unknown => {
  const occurrence = occurrences[index]
  const delivery = deliveries[index]
  if (occurrence === undefined || delivery === undefined) {
    return message
  }

  const envelope = requireEnvelope(message, occurrence, delivery)
  return {
    ...envelope,
    generation: requireSerializableGeneration(occurrence),
    message: stampEnvelopeChain(
      envelope.message,
      occurrences,
      deliveries,
      index + 1,
    ),
  }
}

/** @internal Captures a generated Command result's full occurrence chain. */
export const commandResultMapper = (
  occurrences: ReadonlyArray<Occurrence>,
): ((message: unknown) => unknown) | undefined => {
  const deliveries = occurrences.map(generatedDeliveryFor)
  const generatedCount = deliveries.filter(
    (delivery): delivery is GeneratedDelivery => delivery !== undefined,
  ).length
  if (generatedCount === 0) {
    return undefined
  }
  if (generatedCount !== occurrences.length) {
    throw new Error(
      '[foldkit] A captured Command crosses both generated and authored child Message boundaries. Complete the generated delivery migration for the entire Command path before running it.',
    )
  }

  /* eslint-disable-next-line @typescript-eslint/consistent-type-assertions */
  const generatedDeliveries = deliveries as ReadonlyArray<GeneratedDelivery>
  return message =>
    stampEnvelopeChain(message, occurrences, generatedDeliveries, 0)
}

const ownKey = (message: object): InstanceKey | undefined =>
  Object.hasOwn(message, 'key') ? Reflect.get(message, 'key') : undefined

/** @internal Authorizes decoded external input against the active occurrence tree. */
const captureAuthorizedChildMessage = (
  node: RuntimeOccurrence,
  message: unknown,
  captured: Array<RuntimeOccurrence>,
): boolean => {
  if (!Predicate.isObject(message)) {
    return true
  }

  const tag = Reflect.get(message, '_tag')
  const candidates: Array<
    Readonly<{ binding: object; delivery: GeneratedDelivery }>
  > = []
  for (const binding of runtimeBindingsOf(node.block)) {
    const delivery = generatedDeliveryOf(binding)
    if (delivery !== undefined && delivery.tag === tag) {
      candidates.push({ binding, delivery })
    }
  }
  if (candidates.length === 0) {
    return true
  }

  const placement = Reflect.get(message, 'placement')
  const candidate = candidates.find(
    ({ delivery }) => delivery.placement === placement,
  )
  if (
    candidate === undefined ||
    !Object.hasOwn(message, 'generation') ||
    !Object.hasOwn(message, 'message')
  ) {
    return false
  }

  const { binding, delivery } = candidate
  const key = ownKey(message)
  if (
    (delivery.isKeyed && key === undefined) ||
    (!delivery.isKeyed && Object.hasOwn(message, 'key'))
  ) {
    return false
  }

  const child = node.children.get(binding)?.get(key)
  if (
    child === undefined ||
    !child.isActive ||
    child.generation < 0 ||
    child.generation !== Reflect.get(message, 'generation')
  ) {
    return false
  }

  captured.push(child)
  return captureAuthorizedChildMessage(
    child,
    Reflect.get(message, 'message'),
    captured,
  )
}

/** @internal Captures decoded external input's exact active occurrence chain. */
export const externalMessageGuard = (
  node: RuntimeOccurrence,
  message: unknown,
): (() => boolean) | undefined => {
  const captured: Array<RuntimeOccurrence> = []
  if (!captureAuthorizedChildMessage(node, message, captured)) {
    return undefined
  }
  return () => captured.every(occurrence => occurrence.isActive)
}
