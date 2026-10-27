import { describe, expect, it } from "@effect/vitest"
import { Effect, HashSet, Option, Schema, String as EffectString } from "effect"
import * as Arbitrary from "effect/Arbitrary"

import { alignQuotes } from "../../src/links/quote-alignment.js"
import { splitIntoPassages } from "../../src/links/source-text.js"
import { words } from "../../src/links/words.js"
import { assertPropertyEffect } from "../../src/testing.js"

const Word = Schema.Literals([
  "feijão",
  "mandioca",
  "Açaí",
  "pé",
  "milho",
  "horta",
  "colhemos",
  "árvore",
  "água",
  "Zea",
  "mays",
  "e",
  "com",
])

/** Words, and a run of them to quote. */
const textAndRun = Arbitrary.schema(
  Schema.Struct({
    words: Schema.NonEmptyArray(Word),
    start: Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 20 })),
    length: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 5 })),
  }),
).pipe(
  Arbitrary.map(({ words: textWords, start, length }) => {
    const from = start % textWords.length
    return {
      text: textWords.join(" "),
      run: textWords.slice(from, Math.min(textWords.length, from + length)),
    }
  }),
)

const foldedWords = (text: string) => words(text).map((word) => word.value)

const withoutAccents = (text: string) => text.normalize("NFD").replace(/\p{M}/gu, "")

describe("alignQuotes", () => {
  it.effect("finds verbatim quotes exactly where they are written", () =>
    assertPropertyEffect({
      arbitrary: textAndRun,
      predicate: ({ text, run }) => {
        const quote = run.join(" ")
        const [aligned] = alignQuotes(text, [quote])

        expect(aligned).toBeDefined()
        const { start, end, status } = Option.getOrThrow(aligned ?? Option.none())
        expect(text.slice(start, end)).toBe(quote)
        expect(status).toBe("EXACT")
        return Effect.succeed(true)
      },
    }),
  )

  it.effect("finds quotes whose case, accents or spacing changed, word for word", () =>
    assertPropertyEffect({
      arbitrary: textAndRun,
      predicate: ({ text, run }) => {
        const quote = withoutAccents(run.join("  ").toLocaleUpperCase("pt"))
        const [aligned] = alignQuotes(text, [quote])

        const { start, end } = Option.getOrThrow(aligned ?? Option.none())
        expect(foldedWords(text.slice(start, end))).toEqual(foldedWords(quote))
        return Effect.succeed(true)
      },
    }),
  )

  it.effect("gives a quote repeated as often as the text has it each of its occurrences", () =>
    assertPropertyEffect({
      arbitrary: Arbitrary.schema(Schema.NonEmptyArray(Schema.Array(Word))),
      predicate: (fillers) => {
        const text = fillers.map((filler) => [...filler, "pamonha"].join(" ")).join(". ")
        const aligned = alignQuotes(
          text,
          fillers.map(() => "pamonha"),
        ).map((quote) => Option.getOrThrow(quote))

        expect(HashSet.size(HashSet.fromIterable(aligned.map((quote) => quote.start)))).toBe(
          fillers.length,
        )
        expect(aligned.every((quote) => text.slice(quote.start, quote.end) === "pamonha")).toBe(
          true,
        )
        return Effect.succeed(true)
      },
    }),
  )

  it("tolerates a misquoted word within a longer quote", () => {
    const text = "Nós plantamos feijão com milho na roça."
    const [aligned] = alignQuotes(text, ["plantamos feijões com milho"])

    const { start, end, status } = Option.getOrThrow(aligned ?? Option.none())
    expect(text.slice(start, end)).toBe("plantamos feijão com milho")
    expect(status).toBe("FUZZY")
  })

  it("doesn't match quotes inside longer words, nor quotes the text doesn't have", () => {
    expect(alignQuotes("Cobrimos o solo com palha.", ["sol", "abacaxi", "  "])).toEqual([
      Option.none(),
      Option.none(),
      Option.none(),
    ])
  })
})

describe("splitIntoPassages", () => {
  it.effect("keeps every block whole, in order, at its offset in the text", () =>
    assertPropertyEffect({
      arbitrary: Arbitrary.schema(
        Schema.Struct({
          blocks: Schema.Array(Schema.Array(Word)),
          maximumLength: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 80 })),
        }),
      ),
      predicate: ({ blocks, maximumLength }) => {
        const text = blocks.map((block) => block.join(" ")).join("\n\n")
        const passages = splitIntoPassages(text, maximumLength)

        expect(passages.every((passage) => text.startsWith(passage.text, passage.start))).toBe(true)

        expect(
          passages.every(
            (passage) => passage.text.length <= maximumLength || !passage.text.includes("\n\n"),
          ),
        ).toBe(true)

        expect(
          passages
            .flatMap((passage) => passage.text.split("\n\n"))
            .filter((block) => EffectString.isNonEmpty(block.trim())),
        ).toEqual(
          blocks
            .map((block) => block.join(" "))
            .filter((block) => EffectString.isNonEmpty(block.trim())),
        )

        expect(
          passages.every(
            (passage, index) =>
              index === 0 ||
              passage.start >=
                (passages[index - 1]?.start ?? 0) + (passages[index - 1]?.text.length ?? 0),
          ),
        ).toBe(true)

        return Effect.succeed(true)
      },
    }),
  )
})
