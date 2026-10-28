/**
 * The plain text link inference reads, with the location each character range came from.
 *
 * Language models only see text: marks, node IDs and attribute keys stay out of the prompt. Every
 * span they quote is grounded back to its location through the offsets of the segments it falls in,
 * once `alignQuotes` has found the quote in the text.
 */
import { Array as EffectArray, Match, Option, Schema, String as EffectString } from "effect"

import type { TiptapDocument, TiptapNode } from "../rich-text/domain.js"
import { nodeIdOf } from "../rich-text/node-ids.js"
import { EvidenceLocation } from "./domain.js"

export const SourceSegment = Schema.Struct({
  start: Schema.Int,
  end: Schema.Int,
  location: EvidenceLocation,
  /** Text a contributor already linked by hand, which inference shouldn't link again. */
  isEntityReference: Schema.optional(Schema.Boolean),
})

export type SourceSegment = typeof SourceSegment.Type

export const SourceText = Schema.Struct({
  text: Schema.String,
  /** Nested ranges, such as a list item and its paragraph; the innermost one locates a span. */
  segments: Schema.Array(SourceSegment),
})

export type SourceText = typeof SourceText.Type

export interface GroundedSpan {
  readonly location: EvidenceLocation
  readonly text: string
  readonly isEntityReference: boolean
}

const BLOCK_SEPARATOR = "\n\n"

/** Accumulates text and the segments that locate it. */
export const makeSourceTextBuilder = () => {
  let text = ""
  const segments: Array<SourceSegment> = []

  const append = (value: string) => {
    text += value
  }

  const located = (
    segment: Pick<SourceSegment, "location" | "isEntityReference">,
    write: () => void,
  ) => {
    const start = text.length
    write()
    if (text.length > start) segments.push({ ...segment, start, end: text.length })
  }

  /** Blocks of text are separated by blank lines, so spans don't run across them. */
  const startBlock = () => {
    if (EffectString.isNonEmpty(text) && !text.endsWith(BLOCK_SEPARATOR)) append(BLOCK_SEPARATOR)
  }

  /** `path` is where the document sits in the linking entity's data. */
  const appendRichText = (path: EvidenceLocation, document: TiptapDocument) => {
    const visit = (node: TiptapNode): void => {
      if (node.type === "paragraph" || node.type === "heading") startBlock()

      const write = () =>
        Match.value(node).pipe(
          Match.discriminatorsExhaustive("type")({
            text: (textNode) => append(textNode.text),
            hardBreak: () => append("\n"),
            entityReference: (reference) => append(reference.attrs.labelAtInsertion),
            mediaGallery: () => undefined,
            horizontalRule: () => undefined,
            paragraph: (paragraph) => paragraph.content?.forEach(visit),
            heading: (heading) => heading.content?.forEach(visit),
            blockquote: (quote) => quote.content.forEach(visit),
            bulletList: (list) => list.content.forEach(visit),
            orderedList: (list) => list.content.forEach(visit),
            listItem: (item) => item.content.forEach(visit),
          }),
        )

      const nodeId = nodeIdOf(node)

      if (Option.isSome(nodeId)) {
        located(
          {
            location: [...path, { id: nodeId.value }],
            ...(node.type === "entityReference" ? { isEntityReference: true } : {}),
          },
          write,
        )
      } else {
        write()
      }
    }

    document.content.forEach(visit)
  }

  /** A labelled line of values, such as "scientific names: Zea mays; Zea mays subsp. mays". */
  const appendValues = (
    label: string,
    values: ReadonlyArray<{ readonly text: string; readonly location: EvidenceLocation }>,
  ) => {
    if (!EffectArray.isReadonlyArrayNonEmpty(values)) return
    startBlock()
    append(`${label}: `)
    values.forEach((value, index) => {
      if (index > 0) append("; ")
      located({ location: value.location }, () => append(value.text))
    })
  }

  return {
    startBlock,
    append,
    appendRichText,
    appendValues,
    build: (): SourceText => ({ text, segments: [...segments] }),
  }
}

/**
 * Locates the span of `source` between `start` and `end` in the innermost segment containing it.
 * A span crossing segments is located where it starts; one outside every segment (a label) isn't.
 */
export const groundSpan = (
  source: SourceText,
  interval: { readonly start: number; readonly end: number },
): Option.Option<GroundedSpan> => {
  const text = source.text.slice(interval.start, interval.end).trim()
  if (EffectString.isEmpty(text)) return Option.none()

  const innermost = (segments: ReadonlyArray<SourceSegment>) =>
    EffectArray.match(segments, {
      onEmpty: () => Option.none<SourceSegment>(),
      onNonEmpty: (nonEmpty) =>
        Option.some(
          EffectArray.reduce(nonEmpty, nonEmpty[0], (smallest, segment) =>
            segment.end - segment.start < smallest.end - smallest.start ? segment : smallest,
          ),
        ),
    })

  const containing = source.segments.filter(
    (segment) => segment.start <= interval.start && interval.end <= segment.end,
  )
  const startingIn = source.segments.filter(
    (segment) => segment.start <= interval.start && interval.start < segment.end,
  )

  return Option.orElse(innermost(containing), () => innermost(startingIn)).pipe(
    Option.map((segment) => ({
      location: segment.location,
      text,
      isEntityReference: segment.isEntityReference === true,
    })),
  )
}

/** A stretch of a source text to prompt a language model with, at its offset in the text. */
export interface Passage {
  readonly text: string
  readonly start: number
}

/**
 * Splits text into passages of whole blocks, each at most `maximumLength` long unless a single block
 * is longer. Quotes are aligned within the passage the model read, and spans never cross blocks.
 */
export const splitIntoPassages = (text: string, maximumLength: number): ReadonlyArray<Passage> => {
  const blocks = text
    .split(BLOCK_SEPARATOR)
    .reduce<ReadonlyArray<{ start: number; end: number }>>((found, block) => {
      const start = (found.at(-1)?.end ?? -BLOCK_SEPARATOR.length) + BLOCK_SEPARATOR.length
      return [...found, { start, end: start + block.length }]
    }, [])

  return blocks
    .filter((block) => EffectString.isNonEmpty(text.slice(block.start, block.end).trim()))
    .reduce<ReadonlyArray<{ start: number; end: number }>>((passages, block) => {
      const current = passages.at(-1)
      return current !== undefined && block.end - current.start <= maximumLength
        ? [...passages.slice(0, -1), { start: current.start, end: block.end }]
        : [...passages, block]
    }, [])
    .map(({ start, end }) => ({ text: text.slice(start, end), start }))
}
