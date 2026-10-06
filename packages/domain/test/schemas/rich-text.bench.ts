import { expect, it as test } from "@effect/vitest"
import { Array as EffectArray, Schema } from "effect"

import { TiptapDocument } from "../../src/rich-text/domain.js"
import { largeTiptapDocument } from "../fixtures/large-tiptap-document.js"

const decode = Schema.decodeSync(TiptapDocument)

EffectArray.forEach([1_000, 10_000], (count) => {
  const document = largeTiptapDocument(count)

  test(`decode ${count.toLocaleString("en-US")} paragraphs`, async ({ bench }) => {
    expect(decode(document).content).toHaveLength(count)
    await bench("decode", () => {
      decode(document)
    }).run({ time: 1_000, iterations: 16, warmupIterations: 4 })
  })
})
