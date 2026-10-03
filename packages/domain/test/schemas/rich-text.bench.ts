import { Schema } from "effect"
import { expect, test } from "vitest"

import { TiptapDocument } from "../../src/rich-text/domain.js"
import { largeTiptapDocument } from "../fixtures/large-tiptap-document.js"

const decode = Schema.decodeUnknownSync(TiptapDocument)
for (const count of [1_000, 10_000]) {
  const document = largeTiptapDocument(count)
  test(`decode ${count.toLocaleString("en-US")} paragraphs`, async ({ bench }) => {
    expect(decode(document).content).toHaveLength(count)
    await bench("decode", () => {
      decode(document)
    }).run({ time: 1_000, iterations: 16, warmupIterations: 4 })
  })
}
