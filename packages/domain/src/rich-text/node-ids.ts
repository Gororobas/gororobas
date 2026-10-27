/**
 * Stable identities for the nodes of a Tiptap document, so derived data (such as the evidence of
 * inferred links) can point at the node it came from and survive edits around it.
 */
import { Array as EffectArray, Match, MutableHashSet, Option, Predicate, Schema } from "effect"
import { nanoid } from "nanoid"

import { TiptapNodeId } from "../common/ids.js"
import type {
  TiptapBlockNode,
  TiptapDocument,
  TiptapInlineNode,
  TiptapListItemNode,
  TiptapNode,
  TiptapParagraphNode,
} from "./domain.js"

/** Text nodes can't hold attributes, and hard breaks aren't worth identifying. */
export const IDENTIFIED_NODE_TYPES = [
  "paragraph",
  "heading",
  "blockquote",
  "bulletList",
  "orderedList",
  "listItem",
  "horizontalRule",
  "mediaGallery",
  "entityReference",
] as const satisfies ReadonlyArray<Exclude<TiptapNode["type"], "text" | "hardBreak">>

export const createTiptapNodeId = () => TiptapNodeId.make(nanoid(12))

export const nodeIdOf = (node: TiptapNode): Option.Option<TiptapNodeId> =>
  "attrs" in node && Predicate.isNotUndefined(node.attrs) && "nodeId" in node.attrs
    ? Option.liftPredicate(node.attrs.nodeId, Schema.is(TiptapNodeId))
    : Option.none()

/**
 * Gives every identified node a `nodeId` that is unique within the document, keeping valid ones.
 *
 * Missing or repeated IDs (splitting a paragraph copies its attributes) are taken from the node at
 * the same position in `referenceContent` when it has the same type, so content that went through a
 * lossy round trip (an ID-less submission, a machine translation) keeps the identities of the
 * document it came from. Children are paired by their order among siblings of the same type,
 * which tolerates text nodes splitting or merging around inline nodes.
 */
export const assignTiptapNodeIds = (
  document: TiptapDocument,
  options: { readonly referenceContent?: TiptapDocument | undefined } = {},
): TiptapDocument => {
  const seen = MutableHashSet.empty<TiptapNodeId>()
  // Positional fallback must not take an ID owned by a node visited later.
  const reserved = MutableHashSet.empty<TiptapNodeId>()

  const reserve = (node: TiptapNode): void => {
    Option.map(nodeIdOf(node), (id) => MutableHashSet.add(reserved, id))
    if ("content" in node) node.content?.forEach(reserve)
  }
  document.content.forEach(reserve)

  const claim = (node: TiptapNode, counterpart: TiptapNode | undefined): TiptapNodeId => {
    const candidates = [
      nodeIdOf(node),
      Option.flatMap(Option.fromUndefinedOr(counterpart), nodeIdOf).pipe(
        Option.filter((id) => !MutableHashSet.has(reserved, id)),
      ),
    ]

    const nodeId = EffectArray.findFirst(candidates, (candidate) =>
      Option.exists(candidate, (id) => !MutableHashSet.has(seen, id)),
    ).pipe(Option.flatten, Option.getOrElse(createTiptapNodeId))
    MutableHashSet.add(seen, nodeId)
    return nodeId
  }

  /** The counterpart of each node, by its order among siblings of the same type. */
  const counterpartsOf = (
    nodes: ReadonlyArray<TiptapNode>,
    counterpart: TiptapNode | TiptapDocument | undefined,
  ): ReadonlyArray<TiptapNode | undefined> => {
    const candidates: ReadonlyArray<TiptapNode> =
      counterpart !== undefined && "content" in counterpart ? (counterpart.content ?? []) : []
    const candidatesByType = EffectArray.groupBy(candidates, (candidate) => candidate.type)

    // The k-th node of each type pairs with the k-th candidate of that type.
    return nodes.map((node, index) => {
      const occurrence = nodes
        .slice(0, index)
        .filter((sibling) => sibling.type === node.type).length
      return candidatesByType[node.type]?.[occurrence]
    })
  }

  const visitInline = (
    node: TiptapInlineNode,
    counterpart: TiptapNode | undefined,
  ): TiptapInlineNode =>
    node.type === "entityReference"
      ? { ...node, attrs: { ...node.attrs, nodeId: claim(node, counterpart) } }
      : node

  const visitInlineContent = (
    content: ReadonlyArray<TiptapInlineNode> | undefined,
    counterpart: TiptapNode | undefined,
  ) => {
    if (content === undefined) return undefined
    const counterparts = counterpartsOf(content, counterpart)
    return content.map((child, index) => visitInline(child, counterparts[index]))
  }

  const visitParagraph = (
    node: TiptapParagraphNode,
    counterpart: TiptapNode | undefined,
  ): TiptapParagraphNode => ({
    ...node,
    attrs: { ...node.attrs, nodeId: claim(node, counterpart) },
    content: visitInlineContent(node.content, counterpart),
  })

  const visitListItem = (
    node: TiptapListItemNode,
    counterpart: TiptapNode | undefined,
  ): TiptapListItemNode => {
    const nodeId = claim(node, counterpart)
    const counterparts = counterpartsOf(node.content, counterpart)
    const [paragraph, ...blocks] = node.content

    return {
      ...node,
      attrs: { ...node.attrs, nodeId },
      content: [
        visitParagraph(paragraph, counterparts[0]),
        ...blocks.map((child, index) => visitBlock(child, counterparts[index + 1])),
      ],
    }
  }

  const visitBlock = (
    node: TiptapBlockNode,
    counterpart: TiptapNode | undefined,
  ): TiptapBlockNode =>
    Match.value(node).pipe(
      Match.discriminatorsExhaustive("type")({
        paragraph: (paragraph): TiptapBlockNode => visitParagraph(paragraph, counterpart),
        heading: (heading): TiptapBlockNode => ({
          ...heading,
          attrs: { ...heading.attrs, nodeId: claim(heading, counterpart) },
          content: visitInlineContent(heading.content, counterpart),
        }),
        horizontalRule: (rule): TiptapBlockNode => ({
          ...rule,
          attrs: { ...rule.attrs, nodeId: claim(rule, counterpart) },
        }),
        mediaGallery: (gallery): TiptapBlockNode => ({
          ...gallery,
          attrs: { ...gallery.attrs, nodeId: claim(gallery, counterpart) },
        }),
        blockquote: (quote): TiptapBlockNode => {
          const nodeId = claim(quote, counterpart)
          const counterparts = counterpartsOf(quote.content, counterpart)

          return {
            ...quote,
            attrs: { ...quote.attrs, nodeId },
            content: EffectArray.map(quote.content, (child, index) =>
              visitBlock(child, counterparts[index]),
            ),
          }
        },
        bulletList: (list): TiptapBlockNode => {
          const nodeId = claim(list, counterpart)
          const counterparts = counterpartsOf(list.content, counterpart)

          return {
            ...list,
            attrs: { ...list.attrs, nodeId },
            content: EffectArray.map(list.content, (child, index) =>
              visitListItem(child, counterparts[index]),
            ),
          }
        },
        orderedList: (list): TiptapBlockNode => {
          const nodeId = claim(list, counterpart)
          const counterparts = counterpartsOf(list.content, counterpart)

          return {
            ...list,
            attrs: { ...list.attrs, nodeId },
            content: EffectArray.map(list.content, (child, index) =>
              visitListItem(child, counterparts[index]),
            ),
          }
        },
      }),
    )

  const counterparts = counterpartsOf(document.content, options.referenceContent)
  return {
    ...document,
    content: document.content.map((node, index) => visitBlock(node, counterparts[index])),
  }
}
