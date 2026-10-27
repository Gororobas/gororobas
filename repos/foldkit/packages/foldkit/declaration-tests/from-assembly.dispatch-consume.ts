import {
  OriginalParent,
  Parent,
  ParentComposition,
  RawParent,
  RawParentComposition,
} from './from-assembly.accepted.js'
import type {
  Assert,
  Equal,
  RequiredKeys,
  SameMembers,
} from './from-assembly.assertions.js'

export type AnnotationKeepsRawIdentity = Assert<
  Equal<typeof Parent.Message, typeof OriginalParent.Message>
>
export type AnnotationKeepsCompositionIdentityOutcome = Assert<
  Equal<
    Equal<typeof Parent.Message, typeof ParentComposition.Message>,
    Equal<typeof OriginalParent.Message, typeof ParentComposition.Message>
  >
>
export type FullyRawCompositionIdentityOutcome = Assert<
  Equal<
    Equal<typeof RawParent.Message, typeof RawParentComposition.Message>,
    Equal<typeof OriginalParent.Message, typeof ParentComposition.Message>
  >
>
export type AnnotatedRequiredKeys = Assert<
  Equal<
    RequiredKeys<typeof Parent.Message>,
    RequiredKeys<typeof ParentComposition.Message>
  >
>
export type RawRootRequiredKeys = Assert<
  Equal<
    RequiredKeys<typeof OriginalParent.Message>,
    RequiredKeys<typeof ParentComposition.Message>
  >
>
export type FullyRawRequiredKeys = Assert<
  Equal<
    RequiredKeys<typeof RawParent.Message>,
    RequiredKeys<typeof RawParentComposition.Message>
  >
>

export type AnnotatedCompositionMembers = Assert<
  SameMembers<typeof Parent.Message, typeof ParentComposition.Message>
>
export type RawRootCompositionMembers = Assert<
  SameMembers<typeof OriginalParent.Message, typeof ParentComposition.Message>
>
export type FullyRawCompositionMembers = Assert<
  SameMembers<typeof RawParent.Message, typeof RawParentComposition.Message>
>

export const AnnotatedToComposition: typeof ParentComposition.Message =
  Parent.Message
export const CompositionToAnnotated: typeof Parent.Message =
  ParentComposition.Message
export const RawRootToComposition: typeof ParentComposition.Message =
  OriginalParent.Message
export const CompositionToRawRoot: typeof OriginalParent.Message =
  ParentComposition.Message
export const FullyRawToComposition: typeof RawParentComposition.Message =
  RawParent.Message
export const CompositionToFullyRaw: typeof RawParent.Message =
  RawParentComposition.Message

export type AnnotatedDecoded = Assert<
  Equal<typeof Parent.Message.Type, typeof ParentComposition.Message.Type>
>
export type AnnotatedEncoded = Assert<
  Equal<typeof Parent.Message.Encoded, typeof ParentComposition.Message.Encoded>
>
export type AnnotatedDecodeServices = Assert<
  Equal<
    typeof Parent.Message.DecodingServices,
    typeof ParentComposition.Message.DecodingServices
  >
>
export type AnnotatedEncodeServices = Assert<
  Equal<
    typeof Parent.Message.EncodingServices,
    typeof ParentComposition.Message.EncodingServices
  >
>
export type RawRootDecoded = Assert<
  Equal<
    typeof OriginalParent.Message.Type,
    typeof ParentComposition.Message.Type
  >
>
export type RawRootEncoded = Assert<
  Equal<
    typeof OriginalParent.Message.Encoded,
    typeof ParentComposition.Message.Encoded
  >
>
export type FullyRawDecoded = Assert<
  Equal<typeof RawParent.Message.Type, typeof RawParentComposition.Message.Type>
>
export type FullyRawEncoded = Assert<
  Equal<
    typeof RawParent.Message.Encoded,
    typeof RawParentComposition.Message.Encoded
  >
>
