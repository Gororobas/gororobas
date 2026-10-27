import {
  DeclarationChildPlacementParentComposition,
  DefaultAccessorBinding,
  DefaultPlacementComposition,
  EntriesBinding,
  EntriesByIdBinding,
  EntriesByIdLengthBinding,
  OptionalBinding,
  PrimaryBinding,
  SecondaryBinding,
  composeDynamicChildren,
} from './child-placement.accepted.js'

const primaryPlacement: 'primary' = PrimaryBinding.placement
const secondaryPlacement: 'secondaryPlacement' = SecondaryBinding.placement
const optionalPlacement: 'optional' = OptionalBinding.placement
const entriesPlacement: 'entries' = EntriesBinding.placement
const defaultAccessorPlacement: 'DeclarationChildPlacementChild' =
  DefaultAccessorBinding.placement
const entriesByIdPlacement: 'entriesById' = EntriesByIdBinding.placement
const entriesByIdLengthPlacement: 'entriesByIdLength' =
  EntriesByIdLengthBinding.placement

const bindings: readonly [
  typeof PrimaryBinding,
  typeof SecondaryBinding,
  typeof OptionalBinding,
  typeof EntriesBinding,
] = DeclarationChildPlacementParentComposition.bindings

const defaultPlacementChildren: readonly [
  typeof DefaultAccessorBinding,
  typeof EntriesByIdBinding,
  typeof EntriesByIdLengthBinding,
] = DefaultPlacementComposition.bindings

composeDynamicChildren([PrimaryBinding, PrimaryBinding])

void primaryPlacement
void secondaryPlacement
void optionalPlacement
void entriesPlacement
void defaultAccessorPlacement
void entriesByIdPlacement
void entriesByIdLengthPlacement
void bindings
void defaultPlacementChildren
