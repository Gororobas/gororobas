import { expect, it } from "@effect/vitest"
import { Effect, HashSet, Option, Predicate, Record, Schema } from "effect"
import * as Arbitrary from "effect/Arbitrary"

import { TiptapNodeId } from "../common/ids.js"
import { assertPropertyEffect } from "../testing.js"
import { TiptapDocument, type TiptapNode } from "./domain.js"
import { assignTiptapNodeIds, IDENTIFIED_NODE_TYPES, nodeIdOf } from "./node-ids.js"

const identifiedTypes = HashSet.fromIterable<string>(IDENTIFIED_NODE_TYPES)

const nodesOf = (document: TiptapDocument): ReadonlyArray<TiptapNode> => {
  const nodes: TiptapNode[] = []
  const visit = (node: TiptapNode): void => {
    nodes.push(node)
    if ("content" in node) node.content?.forEach(visit)
  }
  document.content.forEach(visit)
  return nodes
}

/** What a lossy round trip leaves behind: same structure, no IDs, different words. */
const translatedWithoutIds = (document: TiptapDocument): TiptapDocument => {
  const isJsonArray = (value: Schema.Json): value is Schema.JsonArray => Array.isArray(value)
  const isJsonObject = (value: Schema.Json): value is Schema.JsonObject =>
    Predicate.isObject(value) && !isJsonArray(value)

  const translate = (value: Schema.Json): Schema.Json => {
    if (isJsonArray(value)) return value.map(translate)
    if (!isJsonObject(value)) return value

    return Record.fromEntries(
      Record.toEntries(value).flatMap(([key, child]): Array<[string, Schema.Json]> =>
        key === "nodeId"
          ? []
          : [
              [
                key,
                key === "text" && Predicate.isString(child)
                  ? `${child} (traduzido)`
                  : translate(child),
              ],
            ],
      ),
    )
  }

  const json = Schema.toCodecJson(TiptapDocument)
  return Schema.decodeSync(json)(translate(Schema.encodeSync(json)(document)))
}

it.effect("identifies every identified node with an ID that is unique in its document", () =>
  assertPropertyEffect({
    arbitrary: Arbitrary.schema(TiptapDocument),
    predicate: (document) =>
      Effect.sync(() => {
        const identified = assignTiptapNodeIds(document)
        const nodes = nodesOf(identified).filter((node) => HashSet.has(identifiedTypes, node.type))
        const ids = nodes.flatMap((node) => Option.toArray(nodeIdOf(node)))

        expect(HashSet.size(HashSet.fromIterable(ids))).toBe(nodes.length)
        expect(assignTiptapNodeIds(identified)).toEqual(identified)
        return true
      }),
  }),
)

it.effect("restores the identities of a counterpart with the same structure", () =>
  assertPropertyEffect({
    arbitrary: Arbitrary.schema(TiptapDocument),
    predicate: (document) =>
      Effect.sync(() => {
        const source = assignTiptapNodeIds(document)
        const translated = translatedWithoutIds(source)

        expect(
          nodesOf(assignTiptapNodeIds(translated, { referenceContent: source })).map(nodeIdOf),
        ).toEqual(nodesOf(source).map(nodeIdOf))
        return true
      }),
  }),
)

it.effect(
  "preserves existing node IDs when an unidentified paragraph is inserted before them",
  () =>
    assertPropertyEffect({
      arbitrary: Arbitrary.schema(TiptapDocument),
      predicate: (document) =>
        Effect.sync(() => {
          const source = assignTiptapNodeIds(document)
          const submitted = TiptapDocument.make({
            ...source,
            content: [{ type: "paragraph" }, ...source.content],
          })
          const result = assignTiptapNodeIds(submitted, { referenceContent: source })

          expect(nodesOf(result).slice(1).map(nodeIdOf)).toEqual(nodesOf(source).map(nodeIdOf))
          expect(nodesOf(source).map(nodeIdOf)).not.toContainEqual(
            Option.flatMap(Option.fromUndefinedOr(result.content[0]), nodeIdOf),
          )
          return true
        }),
    }),
)

it("gives a fresh ID to the second of two nodes sharing one, as when a paragraph is split", () => {
  const shared = TiptapNodeId.make("paragraph001")

  const identified = assignTiptapNodeIds(
    TiptapDocument.make({
      type: "doc",
      version: 1,
      content: [
        { type: "paragraph", attrs: { nodeId: shared } },
        { type: "paragraph", attrs: { nodeId: shared } },
      ],
    }),
  )

  const [first, second] = identified.content.map(nodeIdOf)

  expect(first).toEqual(Option.some(shared))
  expect(second).not.toEqual(first)
})
