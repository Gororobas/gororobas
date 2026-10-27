/** Version 1 of the supported Tiptap document format; custom nodes version their attributes separately. */
import { Schema, Tuple } from "effect"

import { MediaAssetFormat } from "../common/enums.js"
import {
  MediaAssetId,
  ProfileId,
  PublicationId,
  TiptapNodeId,
  WikiArticleId,
} from "../common/ids.js"
import { ExternalEmbed } from "./external-embed.js"

export * from "./external-embed.js"

const JsonAttributes = Schema.Record(Schema.NonEmptyString, Schema.Json)

/**
 * Every node except `doc`, `text` and `hardBreak` carries a `nodeId` (see `NodeIdExtension`).
 * ProseMirror represents an unset attribute as `null`, so documents parsed from HTML or fresh
 * editor nodes may hold `null` until `assignTiptapNodeIds` runs.
 */
const NodeIdAttribute = { nodeId: Schema.optional(Schema.NullOr(TiptapNodeId)) }

// Attributes stay open so content from other Tiptap extensions round-trips through the CRDT.
const NodeIdAttributes = Schema.StructWithRest(Schema.Struct(NodeIdAttribute), [JsonAttributes])

export const EntityReferenceTarget = Schema.Union([
  Schema.Struct({ referenceType: Schema.Literal("WIKI_ARTICLE"), referenceId: WikiArticleId }),
  Schema.Struct({ referenceType: Schema.Literal("PROFILE"), referenceId: ProfileId }),
  Schema.Struct({ referenceType: Schema.Literal("PUBLICATION"), referenceId: PublicationId }),
])

export type EntityReferenceTarget = typeof EntityReferenceTarget.Type

export const EntityReferenceAttributes = EntityReferenceTarget.mapMembers(
  Tuple.map(
    Schema.fieldsAssign({
      ...NodeIdAttribute,
      version: Schema.Literal(1),
      labelAtInsertion: Schema.String,
    }),
  ),
)

export type EntityReferenceAttributes = typeof EntityReferenceAttributes.Type

/** Labels and alternative text describe this use of the media, rather than the shared file. */
export const MediaGalleryItem = Schema.Union([
  Schema.Struct({
    source: Schema.Literal("MEDIA_ASSET"),
    mediaAssetId: MediaAssetId,
    format: MediaAssetFormat,
    alt: Schema.optional(Schema.String),
    caption: Schema.optional(Schema.String),
  }),
  ExternalEmbed,
])

export type MediaGalleryItem = typeof MediaGalleryItem.Type

export const MediaGalleryAttributes = Schema.Struct({
  ...NodeIdAttribute,
  version: Schema.Literal(1),
  items: Schema.NonEmptyArray(MediaGalleryItem),
})

export type MediaGalleryAttributes = typeof MediaGalleryAttributes.Type

export const TiptapMark = Schema.Struct({
  type: Schema.Literals(["bold", "italic", "strike", "code", "link"]),
  attrs: Schema.optional(JsonAttributes),
})
export type TiptapMark = typeof TiptapMark.Type

export const TiptapTextNode = Schema.Struct({
  type: Schema.Literal("text"),
  text: Schema.NonEmptyString,
  marks: Schema.optional(Schema.Array(TiptapMark)),
})

export type TiptapTextNode = typeof TiptapTextNode.Type

export const EntityReferenceNode = Schema.Struct({
  type: Schema.Literal("entityReference"),
  attrs: EntityReferenceAttributes,
})
export type EntityReferenceNode = typeof EntityReferenceNode.Type

export const MediaGalleryNode = Schema.Struct({
  type: Schema.Literal("mediaGallery"),
  attrs: MediaGalleryAttributes,
})
export type MediaGalleryNode = typeof MediaGalleryNode.Type

export const TiptapHardBreakNode = Schema.Struct({
  type: Schema.Literal("hardBreak"),
  attrs: Schema.optional(JsonAttributes),
})

export const TiptapHorizontalRuleNode = Schema.Struct({
  type: Schema.Literal("horizontalRule"),
  attrs: Schema.optional(NodeIdAttributes),
})

export const TiptapInlineNode = Schema.Union([
  TiptapTextNode,
  EntityReferenceNode,
  TiptapHardBreakNode,
])

export type TiptapInlineNode = typeof TiptapInlineNode.Type

export const TiptapParagraphNode = Schema.Struct({
  type: Schema.Literal("paragraph"),
  attrs: Schema.optional(NodeIdAttributes),
  content: Schema.optional(Schema.Array(TiptapInlineNode)),
})

export type TiptapParagraphNode = typeof TiptapParagraphNode.Type

export const TiptapHeadingNode = Schema.Struct({
  type: Schema.Literal("heading"),
  attrs: Schema.Struct({ ...NodeIdAttribute, level: Schema.Literals([1, 2, 3]) }),
  content: Schema.optional(Schema.Array(TiptapInlineNode)),
})

// Only nested block content is recursive; inline content has a closed, non-recursive vocabulary.
const NestedBlock = Schema.suspend(
  (): Schema.Codec<TiptapBlockNode, TiptapBlockNodeEncoded> => TiptapBlockNode,
)

export interface TiptapBlockquoteNode {
  readonly type: "blockquote"
  readonly attrs?: typeof NodeIdAttributes.Type | undefined
  readonly content: readonly [TiptapBlockNode, ...TiptapBlockNode[]]
}

interface TiptapBlockquoteNodeEncoded {
  readonly type: "blockquote"
  readonly attrs?: typeof NodeIdAttributes.Encoded | undefined
  readonly content: readonly [TiptapBlockNodeEncoded, ...TiptapBlockNodeEncoded[]]
}

export const TiptapBlockquoteNode: Schema.Codec<TiptapBlockquoteNode, TiptapBlockquoteNodeEncoded> =
  Schema.Struct({
    type: Schema.Literal("blockquote"),
    attrs: Schema.optional(NodeIdAttributes),
    content: Schema.NonEmptyArray(NestedBlock),
  })

export interface TiptapListItemNode {
  readonly type: "listItem"
  readonly attrs?: typeof NodeIdAttributes.Type | undefined
  readonly content: readonly [TiptapParagraphNode, ...TiptapBlockNode[]]
}

interface TiptapListItemNodeEncoded {
  readonly type: "listItem"
  readonly attrs?: typeof NodeIdAttributes.Encoded | undefined
  readonly content: readonly [typeof TiptapParagraphNode.Encoded, ...TiptapBlockNodeEncoded[]]
}

export const TiptapListItemNode: Schema.Codec<TiptapListItemNode, TiptapListItemNodeEncoded> =
  Schema.Struct({
    type: Schema.Literal("listItem"),
    attrs: Schema.optional(NodeIdAttributes),
    content: Schema.TupleWithRest(Schema.Tuple([TiptapParagraphNode]), [NestedBlock]),
  })

export const TiptapBulletListNode = Schema.Struct({
  type: Schema.Literal("bulletList"),
  attrs: Schema.optional(NodeIdAttributes),
  content: Schema.NonEmptyArray(TiptapListItemNode),
})

export const TiptapOrderedListNode = Schema.Struct({
  type: Schema.Literal("orderedList"),
  attrs: Schema.optional(
    Schema.Struct({
      ...NodeIdAttribute,
      start: Schema.optional(Schema.Int),
      type: Schema.optional(Schema.NullOr(Schema.String)),
    }),
  ),
  content: Schema.NonEmptyArray(TiptapListItemNode),
})

export type TiptapBlockNode =
  | TiptapParagraphNode
  | typeof TiptapHeadingNode.Type
  | typeof TiptapHorizontalRuleNode.Type
  | MediaGalleryNode
  | TiptapBlockquoteNode
  | typeof TiptapBulletListNode.Type
  | typeof TiptapOrderedListNode.Type

type TiptapBlockNodeEncoded =
  | typeof TiptapParagraphNode.Encoded
  | typeof TiptapHeadingNode.Encoded
  | typeof TiptapHorizontalRuleNode.Encoded
  | typeof MediaGalleryNode.Encoded
  | TiptapBlockquoteNodeEncoded
  | typeof TiptapBulletListNode.Encoded
  | typeof TiptapOrderedListNode.Encoded

export const TiptapBlockNode = Schema.Union([
  TiptapParagraphNode,
  TiptapHeadingNode,
  TiptapHorizontalRuleNode,
  MediaGalleryNode,
  TiptapBlockquoteNode,
  TiptapBulletListNode,
  TiptapOrderedListNode,
])

export const TiptapNode = Schema.Union([TiptapInlineNode, TiptapBlockNode, TiptapListItemNode])
export type TiptapNode = typeof TiptapNode.Type

export const TiptapDocument = Schema.Struct({
  content: Schema.Array(TiptapBlockNode),
  type: Schema.Literal("doc"),
  version: Schema.Literal(1),
})

export type TiptapDocument = typeof TiptapDocument.Type

export const EMPTY_TIPTAP_DOCUMENT: TiptapDocument = TiptapDocument.make({
  content: [],
  type: "doc",
  version: 1,
})

export const TiptapAsHtml = Schema.String.pipe(Schema.brand("TiptapAsHtml"))
export type TiptapAsHtml = typeof TiptapAsHtml.Type
