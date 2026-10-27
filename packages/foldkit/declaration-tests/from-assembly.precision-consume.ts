import type { Layer } from 'effect'
import type { Update } from 'foldkit'

import * as ComposedInit from './composed-init.accepted.js'
import * as ExposedMessage from './exposed-message.accepted.js'
import type {
  Assert,
  Equal,
  RequiredKeys,
  SameMembers,
} from './from-assembly.assertions.js'
import * as Lifecycle from './from-assembly.lifecycle.js'
import * as GeneratedDispatch from './generated-dispatch.accepted.js'

export type GeneratedDispatchChildBlockMembers = Assert<
  SameMembers<
    typeof GeneratedDispatch.GeneratedDispatchChildBlock,
    typeof GeneratedDispatch.RawGeneratedDispatchChildBlock
  >
>
export type GeneratedDispatchChildBlockPresence = Assert<
  Equal<
    RequiredKeys<typeof GeneratedDispatch.GeneratedDispatchChildBlock>,
    RequiredKeys<typeof GeneratedDispatch.RawGeneratedDispatchChildBlock>
  >
>
export const GeneratedDispatchChildBlockToRaw: typeof GeneratedDispatch.RawGeneratedDispatchChildBlock =
  GeneratedDispatch.GeneratedDispatchChildBlock
export const RawToGeneratedDispatchChildBlock: typeof GeneratedDispatch.GeneratedDispatchChildBlock =
  GeneratedDispatch.RawGeneratedDispatchChildBlock
export type GeneratedDispatchChildBlockServices = Assert<
  Equal<
    Layer.Services<
      typeof GeneratedDispatch.GeneratedDispatchChildBlock.EffectsLayer
    >,
    Layer.Services<
      typeof GeneratedDispatch.RawGeneratedDispatchChildBlock.EffectsLayer
    >
  >
>
export type GeneratedDispatchChildBlockErrors = Assert<
  Equal<
    Layer.Error<
      typeof GeneratedDispatch.GeneratedDispatchChildBlock.EffectsLayer
    >,
    Layer.Error<
      typeof GeneratedDispatch.RawGeneratedDispatchChildBlock.EffectsLayer
    >
  >
>
export type GeneratedDispatchChildBlockOutputs = Assert<
  Equal<
    Layer.Success<
      typeof GeneratedDispatch.GeneratedDispatchChildBlock.EffectsLayer
    >,
    Layer.Success<
      typeof GeneratedDispatch.RawGeneratedDispatchChildBlock.EffectsLayer
    >
  >
>
export type GeneratedDispatchChildBlockInitEvidence = Assert<
  Equal<
    Update.RegistrationEvidenceOf<
      ReturnType<typeof GeneratedDispatch.GeneratedDispatchChildBlock.init>
    >,
    Update.RegistrationEvidenceOf<
      ReturnType<typeof GeneratedDispatch.RawGeneratedDispatchChildBlock.init>
    >
  >
>

export type GeneratedDispatchParentBlockMembers = Assert<
  SameMembers<
    typeof GeneratedDispatch.GeneratedDispatchParentBlock,
    typeof GeneratedDispatch.RawGeneratedDispatchParentBlock
  >
>
export type GeneratedDispatchParentBlockPresence = Assert<
  Equal<
    RequiredKeys<typeof GeneratedDispatch.GeneratedDispatchParentBlock>,
    RequiredKeys<typeof GeneratedDispatch.RawGeneratedDispatchParentBlock>
  >
>
export const GeneratedDispatchParentBlockToRaw: typeof GeneratedDispatch.RawGeneratedDispatchParentBlock =
  GeneratedDispatch.GeneratedDispatchParentBlock
export const RawToGeneratedDispatchParentBlock: typeof GeneratedDispatch.GeneratedDispatchParentBlock =
  GeneratedDispatch.RawGeneratedDispatchParentBlock
export type GeneratedDispatchParentBlockServices = Assert<
  Equal<
    Layer.Services<
      typeof GeneratedDispatch.GeneratedDispatchParentBlock.EffectsLayer
    >,
    Layer.Services<
      typeof GeneratedDispatch.RawGeneratedDispatchParentBlock.EffectsLayer
    >
  >
>
export type GeneratedDispatchParentBlockErrors = Assert<
  Equal<
    Layer.Error<
      typeof GeneratedDispatch.GeneratedDispatchParentBlock.EffectsLayer
    >,
    Layer.Error<
      typeof GeneratedDispatch.RawGeneratedDispatchParentBlock.EffectsLayer
    >
  >
>
export type GeneratedDispatchParentBlockOutputs = Assert<
  Equal<
    Layer.Success<
      typeof GeneratedDispatch.GeneratedDispatchParentBlock.EffectsLayer
    >,
    Layer.Success<
      typeof GeneratedDispatch.RawGeneratedDispatchParentBlock.EffectsLayer
    >
  >
>
export type GeneratedDispatchParentBlockInitEvidence = Assert<
  Equal<
    Update.RegistrationEvidenceOf<
      ReturnType<typeof GeneratedDispatch.GeneratedDispatchParentBlock.init>
    >,
    Update.RegistrationEvidenceOf<
      ReturnType<typeof GeneratedDispatch.RawGeneratedDispatchParentBlock.init>
    >
  >
>

export type ApplicationBlockMembers = Assert<
  SameMembers<
    typeof GeneratedDispatch.ApplicationBlock,
    typeof GeneratedDispatch.RawApplicationBlock
  >
>
export type ApplicationBlockPresence = Assert<
  Equal<
    RequiredKeys<typeof GeneratedDispatch.ApplicationBlock>,
    RequiredKeys<typeof GeneratedDispatch.RawApplicationBlock>
  >
>
export const ApplicationBlockToRaw: typeof GeneratedDispatch.RawApplicationBlock =
  GeneratedDispatch.ApplicationBlock
export const RawToApplicationBlock: typeof GeneratedDispatch.ApplicationBlock =
  GeneratedDispatch.RawApplicationBlock
export type ApplicationBlockServices = Assert<
  Equal<
    Layer.Services<typeof GeneratedDispatch.ApplicationBlock.EffectsLayer>,
    Layer.Services<typeof GeneratedDispatch.RawApplicationBlock.EffectsLayer>
  >
>
export type ApplicationBlockErrors = Assert<
  Equal<
    Layer.Error<typeof GeneratedDispatch.ApplicationBlock.EffectsLayer>,
    Layer.Error<typeof GeneratedDispatch.RawApplicationBlock.EffectsLayer>
  >
>
export type ApplicationBlockOutputs = Assert<
  Equal<
    Layer.Success<typeof GeneratedDispatch.ApplicationBlock.EffectsLayer>,
    Layer.Success<typeof GeneratedDispatch.RawApplicationBlock.EffectsLayer>
  >
>
export type ApplicationBlockInitEvidence = Assert<
  Equal<
    Update.RegistrationEvidenceOf<
      ReturnType<typeof GeneratedDispatch.ApplicationBlock.init>
    >,
    Update.RegistrationEvidenceOf<
      ReturnType<typeof GeneratedDispatch.RawApplicationBlock.init>
    >
  >
>

export type ComposedInitBlockMembers = Assert<
  SameMembers<
    typeof ComposedInit.ComposedInitBlock,
    typeof ComposedInit.RawComposedInitBlock
  >
>
export type ComposedInitBlockPresence = Assert<
  Equal<
    RequiredKeys<typeof ComposedInit.ComposedInitBlock>,
    RequiredKeys<typeof ComposedInit.RawComposedInitBlock>
  >
>
export const ComposedInitBlockToRaw: typeof ComposedInit.RawComposedInitBlock =
  ComposedInit.ComposedInitBlock
export const RawToComposedInitBlock: typeof ComposedInit.ComposedInitBlock =
  ComposedInit.RawComposedInitBlock
export type ComposedInitBlockServices = Assert<
  Equal<
    Layer.Services<typeof ComposedInit.ComposedInitBlock.EffectsLayer>,
    Layer.Services<typeof ComposedInit.RawComposedInitBlock.EffectsLayer>
  >
>
export type ComposedInitBlockErrors = Assert<
  Equal<
    Layer.Error<typeof ComposedInit.ComposedInitBlock.EffectsLayer>,
    Layer.Error<typeof ComposedInit.RawComposedInitBlock.EffectsLayer>
  >
>
export type ComposedInitBlockOutputs = Assert<
  Equal<
    Layer.Success<typeof ComposedInit.ComposedInitBlock.EffectsLayer>,
    Layer.Success<typeof ComposedInit.RawComposedInitBlock.EffectsLayer>
  >
>
export type ComposedInitBlockInitEvidence = Assert<
  Equal<
    Update.RegistrationEvidenceOf<
      ReturnType<typeof ComposedInit.ComposedInitBlock.init>
    >,
    Update.RegistrationEvidenceOf<
      ReturnType<typeof ComposedInit.RawComposedInitBlock.init>
    >
  >
>

export type ChildBlockMembers = Assert<
  SameMembers<
    typeof ExposedMessage.ChildBlock,
    typeof ExposedMessage.RawChildBlock
  >
>
export type ChildBlockPresence = Assert<
  Equal<
    RequiredKeys<typeof ExposedMessage.ChildBlock>,
    RequiredKeys<typeof ExposedMessage.RawChildBlock>
  >
>
export const ChildBlockToRaw: typeof ExposedMessage.RawChildBlock =
  ExposedMessage.ChildBlock
export const RawToChildBlock: typeof ExposedMessage.ChildBlock =
  ExposedMessage.RawChildBlock
export type ChildBlockServices = Assert<
  Equal<
    Layer.Services<typeof ExposedMessage.ChildBlock.EffectsLayer>,
    Layer.Services<typeof ExposedMessage.RawChildBlock.EffectsLayer>
  >
>
export type ChildBlockErrors = Assert<
  Equal<
    Layer.Error<typeof ExposedMessage.ChildBlock.EffectsLayer>,
    Layer.Error<typeof ExposedMessage.RawChildBlock.EffectsLayer>
  >
>
export type ChildBlockOutputs = Assert<
  Equal<
    Layer.Success<typeof ExposedMessage.ChildBlock.EffectsLayer>,
    Layer.Success<typeof ExposedMessage.RawChildBlock.EffectsLayer>
  >
>
export type ChildBlockInitEvidence = Assert<
  Equal<
    Update.RegistrationEvidenceOf<
      ReturnType<typeof ExposedMessage.ChildBlock.init>
    >,
    Update.RegistrationEvidenceOf<
      ReturnType<typeof ExposedMessage.RawChildBlock.init>
    >
  >
>

export type ContextBlockMembers = Assert<
  SameMembers<
    typeof ExposedMessage.ContextBlock,
    typeof ExposedMessage.RawContextBlock
  >
>
export type ContextBlockPresence = Assert<
  Equal<
    RequiredKeys<typeof ExposedMessage.ContextBlock>,
    RequiredKeys<typeof ExposedMessage.RawContextBlock>
  >
>
export const ContextBlockToRaw: typeof ExposedMessage.RawContextBlock =
  ExposedMessage.ContextBlock
export const RawToContextBlock: typeof ExposedMessage.ContextBlock =
  ExposedMessage.RawContextBlock
export type ContextBlockServices = Assert<
  Equal<
    Layer.Services<typeof ExposedMessage.ContextBlock.EffectsLayer>,
    Layer.Services<typeof ExposedMessage.RawContextBlock.EffectsLayer>
  >
>
export type ContextBlockErrors = Assert<
  Equal<
    Layer.Error<typeof ExposedMessage.ContextBlock.EffectsLayer>,
    Layer.Error<typeof ExposedMessage.RawContextBlock.EffectsLayer>
  >
>
export type ContextBlockOutputs = Assert<
  Equal<
    Layer.Success<typeof ExposedMessage.ContextBlock.EffectsLayer>,
    Layer.Success<typeof ExposedMessage.RawContextBlock.EffectsLayer>
  >
>
export type ContextBlockInitEvidence = Assert<
  Equal<
    Update.RegistrationEvidenceOf<
      ReturnType<typeof ExposedMessage.ContextBlock.init>
    >,
    Update.RegistrationEvidenceOf<
      ReturnType<typeof ExposedMessage.RawContextBlock.init>
    >
  >
>

export type ParentBlockMembers = Assert<
  SameMembers<
    typeof ExposedMessage.ParentBlock,
    typeof ExposedMessage.RawParentBlock
  >
>
export type ParentBlockPresence = Assert<
  Equal<
    RequiredKeys<typeof ExposedMessage.ParentBlock>,
    RequiredKeys<typeof ExposedMessage.RawParentBlock>
  >
>
export const ParentBlockToRaw: typeof ExposedMessage.RawParentBlock =
  ExposedMessage.ParentBlock
export const RawToParentBlock: typeof ExposedMessage.ParentBlock =
  ExposedMessage.RawParentBlock
export type ParentBlockServices = Assert<
  Equal<
    Layer.Services<typeof ExposedMessage.ParentBlock.EffectsLayer>,
    Layer.Services<typeof ExposedMessage.RawParentBlock.EffectsLayer>
  >
>
export type ParentBlockErrors = Assert<
  Equal<
    Layer.Error<typeof ExposedMessage.ParentBlock.EffectsLayer>,
    Layer.Error<typeof ExposedMessage.RawParentBlock.EffectsLayer>
  >
>
export type ParentBlockOutputs = Assert<
  Equal<
    Layer.Success<typeof ExposedMessage.ParentBlock.EffectsLayer>,
    Layer.Success<typeof ExposedMessage.RawParentBlock.EffectsLayer>
  >
>
export type ParentBlockInitEvidence = Assert<
  Equal<
    Update.RegistrationEvidenceOf<
      ReturnType<typeof ExposedMessage.ParentBlock.init>
    >,
    Update.RegistrationEvidenceOf<
      ReturnType<typeof ExposedMessage.RawParentBlock.init>
    >
  >
>

export type MountedChoiceBlockMembers = Assert<
  SameMembers<
    typeof ExposedMessage.MountedChoiceBlock,
    typeof ExposedMessage.RawMountedChoiceBlock
  >
>
export type MountedChoiceBlockPresence = Assert<
  Equal<
    RequiredKeys<typeof ExposedMessage.MountedChoiceBlock>,
    RequiredKeys<typeof ExposedMessage.RawMountedChoiceBlock>
  >
>
export const MountedChoiceBlockToRaw: typeof ExposedMessage.RawMountedChoiceBlock =
  ExposedMessage.MountedChoiceBlock
export const RawToMountedChoiceBlock: typeof ExposedMessage.MountedChoiceBlock =
  ExposedMessage.RawMountedChoiceBlock
export type MountedChoiceBlockServices = Assert<
  Equal<
    Layer.Services<typeof ExposedMessage.MountedChoiceBlock.EffectsLayer>,
    Layer.Services<typeof ExposedMessage.RawMountedChoiceBlock.EffectsLayer>
  >
>
export type MountedChoiceBlockErrors = Assert<
  Equal<
    Layer.Error<typeof ExposedMessage.MountedChoiceBlock.EffectsLayer>,
    Layer.Error<typeof ExposedMessage.RawMountedChoiceBlock.EffectsLayer>
  >
>
export type MountedChoiceBlockOutputs = Assert<
  Equal<
    Layer.Success<typeof ExposedMessage.MountedChoiceBlock.EffectsLayer>,
    Layer.Success<typeof ExposedMessage.RawMountedChoiceBlock.EffectsLayer>
  >
>
export type MountedChoiceBlockInitEvidence = Assert<
  Equal<
    Update.RegistrationEvidenceOf<
      ReturnType<typeof ExposedMessage.MountedChoiceBlock.init>
    >,
    Update.RegistrationEvidenceOf<
      ReturnType<typeof ExposedMessage.RawMountedChoiceBlock.init>
    >
  >
>

export type ManagedMountedChoiceBlockMembers = Assert<
  SameMembers<
    typeof ExposedMessage.ManagedMountedChoiceBlock,
    typeof ExposedMessage.RawManagedMountedChoiceBlock
  >
>
export type ManagedMountedChoiceBlockPresence = Assert<
  Equal<
    RequiredKeys<typeof ExposedMessage.ManagedMountedChoiceBlock>,
    RequiredKeys<typeof ExposedMessage.RawManagedMountedChoiceBlock>
  >
>
export const ManagedMountedChoiceBlockToRaw: typeof ExposedMessage.RawManagedMountedChoiceBlock =
  ExposedMessage.ManagedMountedChoiceBlock
export const RawToManagedMountedChoiceBlock: typeof ExposedMessage.ManagedMountedChoiceBlock =
  ExposedMessage.RawManagedMountedChoiceBlock
export type ManagedMountedChoiceBlockServices = Assert<
  Equal<
    Layer.Services<
      typeof ExposedMessage.ManagedMountedChoiceBlock.EffectsLayer
    >,
    Layer.Services<
      typeof ExposedMessage.RawManagedMountedChoiceBlock.EffectsLayer
    >
  >
>
export type ManagedMountedChoiceBlockErrors = Assert<
  Equal<
    Layer.Error<typeof ExposedMessage.ManagedMountedChoiceBlock.EffectsLayer>,
    Layer.Error<typeof ExposedMessage.RawManagedMountedChoiceBlock.EffectsLayer>
  >
>
export type ManagedMountedChoiceBlockOutputs = Assert<
  Equal<
    Layer.Success<typeof ExposedMessage.ManagedMountedChoiceBlock.EffectsLayer>,
    Layer.Success<
      typeof ExposedMessage.RawManagedMountedChoiceBlock.EffectsLayer
    >
  >
>
export type ManagedMountedChoiceBlockInitEvidence = Assert<
  Equal<
    Update.RegistrationEvidenceOf<
      ReturnType<typeof ExposedMessage.ManagedMountedChoiceBlock.init>
    >,
    Update.RegistrationEvidenceOf<
      ReturnType<typeof ExposedMessage.RawManagedMountedChoiceBlock.init>
    >
  >
>

export type ExactBlockMembers = Assert<
  SameMembers<
    typeof ExposedMessage.ExactBlock,
    typeof ExposedMessage.RawExactBlock
  >
>
export type ExactBlockPresence = Assert<
  Equal<
    RequiredKeys<typeof ExposedMessage.ExactBlock>,
    RequiredKeys<typeof ExposedMessage.RawExactBlock>
  >
>
export const ExactBlockToRaw: typeof ExposedMessage.RawExactBlock =
  ExposedMessage.ExactBlock
export const RawToExactBlock: typeof ExposedMessage.ExactBlock =
  ExposedMessage.RawExactBlock
export type ExactBlockServices = Assert<
  Equal<
    Layer.Services<typeof ExposedMessage.ExactBlock.EffectsLayer>,
    Layer.Services<typeof ExposedMessage.RawExactBlock.EffectsLayer>
  >
>
export type ExactBlockErrors = Assert<
  Equal<
    Layer.Error<typeof ExposedMessage.ExactBlock.EffectsLayer>,
    Layer.Error<typeof ExposedMessage.RawExactBlock.EffectsLayer>
  >
>
export type ExactBlockOutputs = Assert<
  Equal<
    Layer.Success<typeof ExposedMessage.ExactBlock.EffectsLayer>,
    Layer.Success<typeof ExposedMessage.RawExactBlock.EffectsLayer>
  >
>
export type ExactBlockInitEvidence = Assert<
  Equal<
    Update.RegistrationEvidenceOf<
      ReturnType<typeof ExposedMessage.ExactBlock.init>
    >,
    Update.RegistrationEvidenceOf<
      ReturnType<typeof ExposedMessage.RawExactBlock.init>
    >
  >
>

export type RootBlockMembers = Assert<
  SameMembers<typeof Lifecycle.RootBlock, typeof Lifecycle.RawRootBlock>
>
export type RootBlockPresence = Assert<
  Equal<
    RequiredKeys<typeof Lifecycle.RootBlock>,
    RequiredKeys<typeof Lifecycle.RawRootBlock>
  >
>
export const RootBlockToRaw: typeof Lifecycle.RawRootBlock = Lifecycle.RootBlock
export const RawToRootBlock: typeof Lifecycle.RootBlock = Lifecycle.RawRootBlock
export type RootBlockServices = Assert<
  Equal<
    Layer.Services<typeof Lifecycle.RootBlock.EffectsLayer>,
    Layer.Services<typeof Lifecycle.RawRootBlock.EffectsLayer>
  >
>
export type RootBlockErrors = Assert<
  Equal<
    Layer.Error<typeof Lifecycle.RootBlock.EffectsLayer>,
    Layer.Error<typeof Lifecycle.RawRootBlock.EffectsLayer>
  >
>
export type RootBlockOutputs = Assert<
  Equal<
    Layer.Success<typeof Lifecycle.RootBlock.EffectsLayer>,
    Layer.Success<typeof Lifecycle.RawRootBlock.EffectsLayer>
  >
>
export type RootBlockInitEvidence = Assert<
  Equal<
    Update.RegistrationEvidenceOf<ReturnType<typeof Lifecycle.RootBlock.init>>,
    Update.RegistrationEvidenceOf<
      ReturnType<typeof Lifecycle.RawRootBlock.init>
    >
  >
>
