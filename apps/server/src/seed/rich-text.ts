import {
  type EvidenceLocation,
  type EntityReferenceTarget,
  nodeIdOf,
  type MediaAssetId,
  type SupportedLanguage,
  type TiptapBlockNode,
  type TiptapDocument,
  type TiptapInlineNode,
  type TiptapListItemNode,
  TiptapNodeId,
} from "@gororobas/domain"
import { Array as EffectArray, Effect, Option, Random } from "effect"

import { chance, nanoId, pick, pickOption, sample } from "./seed-random.js"
import { CONCEPTS, HEADINGS, LIST_ITEMS, PLACES, PLANTS, SENTENCES } from "./vocabulary.js"

/** An entity that rich text can reference inline, with the label shown at insertion time. */
export type Reference = EntityReferenceTarget & { readonly label: string }

export interface RichTextOptions {
  readonly language: SupportedLanguage
  readonly paragraphs: readonly [min: number, max: number]
  readonly references?: ReadonlyArray<Reference>
  readonly media?: ReadonlyArray<MediaAssetId>
  /** Long documents add headings, lists, quotes and rules between paragraphs. */
  readonly long?: boolean
}

/** Editors identify every node (see `NodeIdExtension`); seeded content does too, reproducibly. */
const nodeId = Effect.map(nanoId, (id) => ({ nodeId: TiptapNodeId.make(id) }))

const sentence = (language: SupportedLanguage) =>
  Effect.gen(function* () {
    const template = yield* pick(SENTENCES[language])
    const plant = yield* pick(PLANTS)
    const concept = yield* pick(CONCEPTS)

    return template({
      plant: plant.names[language].toLowerCase(),
      place: yield* pick(PLACES),
      concept: concept[language].toLowerCase(),
    })
  })

const text = (value: string, marks?: ReadonlyArray<"bold" | "italic">): TiptapInlineNode =>
  marks && EffectArray.isReadonlyArrayNonEmpty(marks)
    ? { type: "text", text: value, marks: marks.map((type) => ({ type })) }
    : { type: "text", text: value }

const markedSentence = (language: SupportedLanguage) =>
  Effect.gen(function* () {
    const marks = (yield* chance(0.1)) ? [yield* pick(["bold", "italic"] as const)] : undefined
    return text(yield* sentence(language), marks)
  })

const paragraph = (language: SupportedLanguage, references: ReadonlyArray<Reference>) =>
  Effect.gen(function* () {
    const sentences = yield* Effect.replicateEffect(
      markedSentence(language),
      yield* Random.nextIntBetween(1, 3),
      { concurrency: 1 },
    )

    const reference = (yield* chance(0.5)) ? yield* pickOption(references) : undefined

    const content: Array<TiptapInlineNode> = EffectArray.intersperse(sentences, text(" "))

    if (reference) {
      const { label, ...target } = reference
      content.push(text(" "), {
        type: "entityReference",
        attrs: { ...target, ...(yield* nodeId), version: 1, labelAtInsertion: label },
      })
    }

    return { type: "paragraph", attrs: yield* nodeId, content } satisfies TiptapBlockNode
  })

const listItem = (value: string) =>
  Effect.gen(function* () {
    return {
      type: "listItem",
      attrs: yield* nodeId,
      content: [{ type: "paragraph", attrs: yield* nodeId, content: [text(value)] }],
    } satisfies TiptapListItemNode
  })

const list = (language: SupportedLanguage, type: "bulletList" | "orderedList") =>
  Effect.gen(function* () {
    const [first = "", ...rest] = yield* sample(
      LIST_ITEMS[language],
      yield* Random.nextIntBetween(2, 4),
    )

    return {
      type,
      attrs: yield* nodeId,
      content: [
        yield* listItem(first),
        ...(yield* Effect.forEach(rest, listItem, { concurrency: 1 })),
      ],
    } satisfies TiptapBlockNode
  })

/** Block nodes that break up paragraphs in long documents. */
const decorations = (
  language: SupportedLanguage,
  references: ReadonlyArray<Reference>,
): EffectArray.NonEmptyReadonlyArray<Effect.Effect<TiptapBlockNode>> => [
  Effect.gen(function* () {
    return {
      type: "heading",
      attrs: { level: yield* pick([2, 3] as const), ...(yield* nodeId) },
      content: [text(yield* pick(HEADINGS[language]))],
    } satisfies TiptapBlockNode
  }),
  Effect.map(nodeId, (attrs) => ({ type: "horizontalRule", attrs }) satisfies TiptapBlockNode),
  Effect.gen(function* () {
    return {
      type: "blockquote",
      attrs: yield* nodeId,
      content: [yield* paragraph(language, references)],
    } satisfies TiptapBlockNode
  }),
  list(language, "bulletList"),
  list(language, "orderedList"),
]

const block = (options: RichTextOptions & { index: number }) =>
  Effect.gen(function* () {
    const references = options.references ?? []
    const decorated = options.long === true && options.index > 0 && (yield* chance(0.35))
    const decoration = decorated
      ? [yield* Effect.flatten(pick(decorations(options.language, references)))]
      : []

    return [...decoration, yield* paragraph(options.language, references)]
  })

export const richTextDocument = (options: RichTextOptions) =>
  Effect.gen(function* () {
    const count = yield* Random.nextIntBetween(...options.paragraphs)

    const blocks = yield* Effect.forEach(
      EffectArray.makeBy(count, (index) => index),
      (index) => block({ ...options, index }),
      { concurrency: 1 },
    )

    const content: Array<TiptapBlockNode> = blocks.flat()
    const media = options.media ?? []

    if (EffectArray.isReadonlyArrayNonEmpty(media)) {
      const item = (mediaAssetId: MediaAssetId) =>
        ({ source: "MEDIA_ASSET", mediaAssetId, format: "IMAGE" }) as const
      const [first, ...rest] = media

      content.splice(Math.min(1, content.length), 0, {
        type: "mediaGallery",
        attrs: { ...(yield* nodeId), version: 1, items: [item(first), ...rest.map(item)] },
      })
    }

    return { type: "doc", version: 1, content } satisfies TiptapDocument
  })

export const shortText = (language: SupportedLanguage) =>
  richTextDocument({ language, paragraphs: [1, 1] })

/** Where seeded link evidence points, standing in for link inference: a document's first paragraph. */
export const firstParagraphEvidence = (path: EvidenceLocation, document: TiptapDocument) =>
  EffectArray.head(document.content).pipe(
    Option.flatMap((block) =>
      block.type === "paragraph"
        ? Option.all({
            nodeId: nodeIdOf(block),
            text: EffectArray.findFirst(block.content ?? [], (node) =>
              node.type === "text" ? Option.some(node.text) : Option.none(),
            ),
          })
        : Option.none(),
    ),
    Option.map(({ nodeId, text }) => ({
      location: [...path, { id: nodeId }] satisfies EvidenceLocation,
      text,
    })),
  )
