import { Layer } from 'effect'
import { Program } from 'foldkit'

import {
  AnnotatedRegisteredBlock,
  AnnotatedUnregisteredBlock,
  KeyedOtherPlacementBlock,
  KeyedRegisteredBlock,
  type KeyedSessionService,
  KeyedUnregisteredBlock,
  RegisteredBlock,
  RenamedRegistrationBlock,
  SessionReaderLayer,
  Store,
  SuppliedStoreBlock,
  UnregisteredBlock,
  UnsuppliedStoreBlock,
} from './program-union-services.accepted.js'

export const rejectUnregistered = () => {
  const pending = Program.makeElement({
    block: UnregisteredBlock,
    container: null,
  }).provide(Layer.empty)
  // @ts-expect-error An unregistered resource remains an ordinary requirement.
  pending.start()
}

export const rejectPartiallyRegisteredUnion = (
  block: typeof RegisteredBlock | typeof UnregisteredBlock,
) => {
  const pending = Program.makeElement({ block, container: null }).provide(
    Layer.empty,
  )
  // @ts-expect-error One alternative cannot install the resource for another.
  pending.start()
}

export const rejectPartiallyRegisteredProviderInput = (
  block: typeof RegisteredBlock | typeof UnregisteredBlock,
) => {
  const pending = Program.makeElement({ block, container: null })
    .provide(SessionReaderLayer)
    .provide(Layer.empty)
  // @ts-expect-error A provider still needs a resource absent from one alternative.
  pending.start()
}

export const rejectUnrelatedProvider = (
  block: typeof RegisteredBlock | typeof RenamedRegistrationBlock,
) => {
  const pending = Program.makeElement({ block, container: null })
    .provide(Layer.effectDiscard(Store))
    .provide(Layer.empty)
  // @ts-expect-error A guaranteed resource does not supply an ordinary Service.
  pending.start()
}

export const rejectKeyedPartiallyRegisteredUnion = (
  block: typeof KeyedRegisteredBlock | typeof KeyedUnregisteredBlock,
) => {
  const pending = Program.makeElement({ block, container: null }).provide(
    Layer.empty,
  )
  // @ts-expect-error One alternative's keyed resource cannot satisfy another alternative.
  pending.start()
}

export const rejectDifferentPlacement = (
  block: typeof KeyedRegisteredBlock | typeof KeyedOtherPlacementBlock,
  layer: Layer.Layer<never, never, KeyedSessionService>,
) => {
  const pending = Program.makeElement({ block, container: null })
    .provide(layer)
    .provide(Layer.empty)
  // @ts-expect-error Distinct placements are distinct resource capabilities.
  pending.start()
}

export const rejectPartiallySuppliedStore = (
  block: typeof SuppliedStoreBlock | typeof UnsuppliedStoreBlock,
) => {
  const pending = Program.makeElement({ block, container: null })
  // @ts-expect-error A different alternative's Layer cannot supply this selected Block.
  pending.start()
  // @ts-expect-error An empty provider cannot supply the missing Store.
  pending.provide(Layer.empty).start()
}

export const rejectAnnotatedPartiallyRegisteredUnion = (
  block: typeof AnnotatedRegisteredBlock | typeof AnnotatedUnregisteredBlock,
) => {
  const pending = Program.makeElement({ block, container: null }).provide(
    Layer.empty,
  )
  // @ts-expect-error Exact annotation headers cannot supply an absent resource.
  pending.start()
}
