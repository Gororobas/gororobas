import { describe, expect, it } from "@effect/vitest"
import { Option, Schema } from "effect"
import * as Arbitrary from "effect/Arbitrary"

import { assertProperty } from "../testing.js"
import { googleBooksVolumeIdInUrl, isbnsInUrl, isValidIsbn } from "./book-identifiers.js"

const isbn13 = (prefix: string) => {
  const sum = prefix
    .split("")
    .map((digit, index) => Number(digit) * (index % 2 === 0 ? 1 : 3))
    .reduce((total, weighted) => total + weighted, 0)
  return `${prefix}${(10 - (sum % 10)) % 10}`
}

describe("book identifiers", () => {
  it("finds valid ISBNs in bookstore URLs and ignores other numbers", () => {
    assertProperty({
      arbitrary: Arbitrary.schema(
        Schema.Struct({
          body: Schema.String.check(Schema.isPattern(/^97[89][0-9]{9}$/)),
          slug: Schema.String.check(Schema.isPattern(/^[a-z-]{0,20}$/)),
        }),
      ),
      predicate: ({ body, slug }) => {
        const isbn = isbn13(body)
        const wrongCheckDigit = `${body}${(Number(isbn.at(-1)) + 1) % 10}`
        expect(isValidIsbn(isbn)).toBe(true)
        expect(isbnsInUrl(`https://example.org/livro/${isbn}/${slug}`)).toEqual([isbn])
        expect(isbnsInUrl(`https://example.org/livro/${wrongCheckDigit}${slug}`)).toEqual([])
        expect(isbnsInUrl(`https://example.org/livro/1${isbn}`)).toEqual([])
        return true
      },
    })
  })

  it("validates ISBN-10 check digits, including X", () => {
    expect(isValidIsbn("85-359-0277-5")).toBe(true)
    expect(isValidIsbn("080442957X")).toBe(true)
    expect(isValidIsbn("0804429571")).toBe(false)
  })

  it("reads volume IDs only from Google Books pages", () => {
    expect(
      googleBooksVolumeIdInUrl(
        "https://books.google.com.br/books/about/Manejo_ecol%C3%B3gico_do_solo.html?id=6l6XAAAACAAJ&redir_esc=y",
      ),
    ).toEqual(Option.some("6l6XAAAACAAJ"))

    expect(googleBooksVolumeIdInUrl("https://example.org/books?id=6l6XAAAACAAJ")).toEqual(
      Option.none(),
    )
    expect(googleBooksVolumeIdInUrl("not a URL")).toEqual(Option.none())
  })
})
