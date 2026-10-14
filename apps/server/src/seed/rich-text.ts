import type {
  EntityReferenceTarget,
  MediaAssetId,
  SupportedLanguage,
  TiptapBlockNode,
  TiptapDocument,
  TiptapInlineNode,
  TiptapListItemNode,
} from "@gororobas/domain"
import { Array as EffectArray, Effect, Random } from "effect"

import { chance, pick, pickOption, sample } from "./seed-random.js"
import { CONCEPTS, HEADINGS, LIST_ITEMS, PLACES, PLANTS, SENTENCES } from "./vocabulary.js"

/** An entity that rich text can reference inline, with the label shown at insertion time. */
export type Mention = EntityReferenceTarget & { readonly label: string }

export interface RichTextOptions {
  readonly language: SupportedLanguage
  readonly paragraphs: readonly [min: number, max: number]
  readonly mentions?: ReadonlyArray<Mention>
  readonly media?: ReadonlyArray<MediaAssetId>
  /** Long documents add headings, lists, quotes and rules between paragraphs. */
  readonly long?: boolean
}

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

const paragraph = (language: SupportedLanguage, mentions: ReadonlyArray<Mention>) =>
  Effect.gen(function* () {
    const sentences = yield* Effect.replicateEffect(
      markedSentence(language),
      yield* Random.nextIntBetween(1, 3),
      { concurrency: 1 },
    )

    const mention = (yield* chance(0.5)) ? yield* pickOption(mentions) : undefined

    const content: Array<TiptapInlineNode> = EffectArray.intersperse(sentences, text(" "))

    if (mention) {
      const { label, ...target } = mention
      content.push(text(" "), {
        type: "entityReference",
        attrs: { ...target, version: 1, labelAtInsertion: label },
      })
    }

    return { type: "paragraph", content } satisfies TiptapBlockNode
  })

const listItem = (value: string): TiptapListItemNode => ({
  type: "listItem",
  content: [{ type: "paragraph", content: [text(value)] }],
})

const list = (language: SupportedLanguage, type: "bulletList" | "orderedList") =>
  Effect.gen(function* () {
    const [first = "", ...rest] = yield* sample(
      LIST_ITEMS[language],
      yield* Random.nextIntBetween(2, 4),
    )
    return { type, content: [listItem(first), ...rest.map(listItem)] } satisfies TiptapBlockNode
  })

/** Block nodes that break up paragraphs in long documents. */
const decorations = (
  language: SupportedLanguage,
  mentions: ReadonlyArray<Mention>,
): EffectArray.NonEmptyReadonlyArray<Effect.Effect<TiptapBlockNode>> => [
  Effect.gen(function* () {
    return {
      type: "heading",
      attrs: { level: yield* pick([2, 3] as const) },
      content: [text(yield* pick(HEADINGS[language]))],
    } satisfies TiptapBlockNode
  }),
  Effect.succeed({ type: "horizontalRule" } satisfies TiptapBlockNode),
  Effect.map(
    paragraph(language, mentions),
    (quoted) => ({ type: "blockquote", content: [quoted] }) satisfies TiptapBlockNode,
  ),
  list(language, "bulletList"),
  list(language, "orderedList"),
]

const block = (options: RichTextOptions & { index: number }) =>
  Effect.gen(function* () {
    const mentions = options.mentions ?? []
    const decorated = options.long === true && options.index > 0 && (yield* chance(0.35))
    const decoration = decorated
      ? [yield* Effect.flatten(pick(decorations(options.language, mentions)))]
      : []

    return [...decoration, yield* paragraph(options.language, mentions)]
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
        type: "mediaGrid",
        attrs: { version: 1, items: [item(first), ...rest.map(item)] },
      })
    }

    return { type: "doc", version: 1, content } satisfies TiptapDocument
  })

export const shortText = (language: SupportedLanguage) =>
  richTextDocument({ language, paragraphs: [1, 1] })
