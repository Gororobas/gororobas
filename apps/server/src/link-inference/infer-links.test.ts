import { describe, expect, it } from "@effect/vitest"
import {
  LinkInferenceModel,
  makeAliasIndex,
  type ModelExtraction,
  publicationSourceText,
  type SourceText,
  TiptapDocument,
  TiptapNodeId,
  WikiArticleId,
  type WikiArticleKind,
} from "@gororobas/domain"
import { assertPropertyEffect } from "@gororobas/domain/testing"
import { Effect, Layer, Option, Record, Schema } from "effect"
import * as Arbitrary from "effect/Arbitrary"

import { inferLinks } from "./infer-links.js"

const id = (suffix: string) =>
  WikiArticleId.make(`019a0000-0000-7000-8000-${suffix.padStart(12, "0")}`)

const articles = {
  feijao: { wikiArticleId: id("1"), kind: "PLANT", names: ["Feijão", "Phaseolus vulgaris"] },
  mandioca: { wikiArticleId: id("2"), kind: "PLANT", names: ["Mandioca", "aipim"] },
  milpa: { wikiArticleId: id("3"), kind: "CONCEPT", names: ["Milpa"] },
  // Two articles sharing a name, for disambiguation.
  manga: { wikiArticleId: id("4"), kind: "PLANT", names: ["Manga"] },
  mangaCulture: { wikiArticleId: id("5"), kind: "CONCEPT", names: ["Manga"] },
} satisfies Record<
  string,
  { wikiArticleId: WikiArticleId; kind: WikiArticleKind; names: ReadonlyArray<string> }
>

const aliases = makeAliasIndex(
  Record.values(articles).flatMap(({ wikiArticleId, kind, names }) =>
    names.map((alias) => ({ wikiArticleId, kind, alias })),
  ),
)

const nodeId = (index: number) => TiptapNodeId.make(`paragraph${String(index).padStart(3, "0")}`)

const sourceOf = (paragraphs: ReadonlyArray<string>) =>
  publicationSourceText({
    sourceContent: TiptapDocument.make({
      type: "doc",
      version: 1,
      content: paragraphs.map((text, index) => ({
        type: "paragraph",
        attrs: { nodeId: nodeId(index) },
        content: [{ type: "text", text }],
      })),
    }),
  })

/** An extraction quoting `text` where it first appears in the source. */
const quoting = ({
  source,
  text,
  ...extraction
}: { source: SourceText; text: string } & Partial<ModelExtraction>): ModelExtraction => {
  const start = source.text.indexOf(text)

  return {
    interval: start < 0 ? null : { start, end: start + text.length },
    alignmentStatus: "EXACT",
    names: { pt: [], es: [], en: [] },
    rationale: null,
    ...extraction,
  }
}

const modelLayer = (model: {
  mentions?: (source: SourceText) => ReadonlyArray<ModelExtraction>
  inferences?: (source: SourceText) => ReadonlyArray<ModelExtraction>
  disambiguate?: (candidates: ReadonlyArray<WikiArticleId>) => Option.Option<WikiArticleId>
}) =>
  Layer.succeed(LinkInferenceModel, {
    model: null,
    detectMentions: ({ source }) => Effect.succeed(model.mentions?.(source) ?? []),
    detectInferences: ({ source }) => Effect.succeed(model.inferences?.(source) ?? []),
    disambiguate: ({ candidates }) =>
      Effect.succeed(
        model.disambiguate?.(candidates.map((candidate) => candidate.wikiArticleId)) ??
          Option.none(),
      ),
  })

const infer = (source: SourceText, exclude: Option.Option<WikiArticleId> = Option.none()) =>
  inferLinks({ source, context: Option.none(), aliases, exclude })

const Filler = Schema.Literals(["Hoje", "plantamos", "na", "horta", "com", "chuva", "e", "sol"])
const Named = Schema.Literals(["feijão", "FEIJÕES", "Feijao", "mandioca", "aipim", "milpa"])

const namedArticle = {
  feijão: articles.feijao,
  FEIJÕES: articles.feijao,
  Feijao: articles.feijao,
  mandioca: articles.mandioca,
  aipim: articles.mandioca,
  milpa: articles.milpa,
} as const

describe("inferLinks", () => {
  it.effect("links every exact name in the text to its article, in the paragraph naming it", () =>
    assertPropertyEffect({
      arbitrary: Arbitrary.schema(
        Schema.NonEmptyArray(
          Schema.Struct({
            before: Schema.Array(Filler),
            named: Named,
            after: Schema.Array(Filler),
          }),
        ),
      ),
      predicate: (paragraphs) =>
        Effect.gen(function* () {
          const source = sourceOf(
            paragraphs.map(({ before, named, after }) => [...before, named, ...after].join(" ")),
          )
          const { links, suggestions } = yield* infer(source)

          const expected = paragraphs.map(({ named }, index) => ({
            wikiArticleId: namedArticle[named].wikiArticleId,
            location: ["sourceContent", { id: nodeId(index) }],
            text: named,
          }))

          const found = links.flatMap((link) =>
            link.evidence.map((evidence) => ({
              wikiArticleId: link.wikiArticleId,
              location: evidence.location,
              text: evidence.text,
            })),
          )

          expect(links.every((link) => link.source === "MENTION")).toBe(true)
          expect(found).toEqual(expect.arrayContaining(expected))
          expect(found).toHaveLength(expected.length)
          expect(suggestions).toEqual([])
          return true
        }).pipe(Effect.provide(modelLayer({}))),
    }),
  )

  it.effect("never links an article to itself, nor suggests creating it", () =>
    Effect.gen(function* () {
      const source = sourceOf(["A mandioca, ou aipim, cresce com feijão."])

      const { links, suggestions } = yield* infer(
        source,
        Option.some(articles.mandioca.wikiArticleId),
      ).pipe(
        Effect.provide(
          modelLayer({
            mentions: (source) => [
              quoting({
                source,
                text: "aipim",
                names: { pt: ["mandioca"], es: ["yuca"], en: ["cassava"] },
              }),
            ],
          }),
        ),
      )

      expect(links.map((link) => link.wikiArticleId)).toEqual([articles.feijao.wikiArticleId])
      expect(suggestions).toEqual([])
    }),
  )

  it.effect("disambiguates self-mentions before excluding the current article", () =>
    Effect.forEach(
      [articles.manga.wikiArticleId, articles.mangaCulture.wikiArticleId],
      (chosen) =>
        Effect.gen(function* () {
          const source = sourceOf(["A manga está madura."])

          const { links, suggestions } = yield* infer(
            source,
            Option.some(articles.manga.wikiArticleId),
          ).pipe(
            Effect.provide(
              modelLayer({
                mentions: (source) => [
                  quoting({
                    source,
                    text: "manga",
                    names: { pt: ["manga"], es: ["mango"], en: ["mango"] },
                  }),
                ],
                disambiguate: (candidates) => {
                  expect(candidates).toEqual([
                    articles.manga.wikiArticleId,
                    articles.mangaCulture.wikiArticleId,
                  ])
                  return Option.some(chosen)
                },
              }),
            ),
          )

          expect(links.map((link) => link.wikiArticleId)).toEqual(
            chosen === articles.manga.wikiArticleId ? [] : [chosen],
          )
          expect(suggestions).toEqual([])
        }),
      { concurrency: 1, discard: true },
    ),
  )

  it.effect("links inferences with their rationale and drops what the text doesn't contain", () =>
    Effect.gen(function* () {
      const source = sourceOf(["Semeamos o milho junto com feijão e abóbora."])
      const rationale = "Maize, beans and squash grown together are a milpa."

      const { links } = yield* infer(source).pipe(
        Effect.provide(
          modelLayer({
            inferences: (source) => [
              quoting({
                source,
                text: "milho junto com feijão e abóbora",
                names: { pt: ["milpa"], es: ["milpa"], en: ["milpa"] },
                rationale,
              }),
              // Unaligned: the model quoted something that isn't in the text.
              quoting({
                source,
                text: "três irmãs",
                names: { pt: ["milpa"], es: ["milpa"], en: ["milpa"] },
                rationale,
              }),
              // No rationale for a reader to verify.
              quoting({ source, text: "abóbora", names: { pt: ["milpa"], es: [], en: [] } }),
            ],
          }),
        ),
      )

      const inferred = links.filter((link) => link.source === "INFERENCE")

      expect(inferred).toEqual([
        {
          wikiArticleId: articles.milpa.wikiArticleId,
          source: "INFERENCE",
          evidence: [
            {
              location: ["sourceContent", { id: nodeId(0) }],
              text: "milho junto com feijão e abóbora",
              rationale,
              alignmentStatus: "EXACT",
            },
          ],
        },
      ])
    }),
  )

  it.effect("suggests the articles that don't exist yet", () =>
    Effect.gen(function* () {
      const source = sourceOf(["Fizemos compostagem com folhas secas."])

      const { links, suggestions } = yield* infer(source).pipe(
        Effect.provide(
          modelLayer({
            mentions: (source) => [
              quoting({
                source,
                text: "compostagem",
                names: { pt: ["compostagem"], es: ["compostaje"], en: ["composting"] },
              }),
            ],
          }),
        ),
      )

      expect(links).toEqual([])

      expect(suggestions).toEqual([
        {
          names: { pt: "compostagem", es: "compostaje", en: "composting" },
          source: "MENTION",
          evidence: [
            {
              location: ["sourceContent", { id: nodeId(0) }],
              text: "compostagem",
              alignmentStatus: "EXACT",
            },
          ],
        },
      ])
    }),
  )

  it.effect(
    "asks the model which article a shared name refers to, linking none if it can't tell",
    () =>
      Effect.gen(function* () {
        const source = sourceOf(["A manga está madura."])

        const resolved = yield* infer(source).pipe(
          Effect.provide(
            modelLayer({ disambiguate: (candidates) => Option.fromUndefinedOr(candidates[0]) }),
          ),
        )

        const unresolved = yield* infer(source).pipe(Effect.provide(modelLayer({})))

        expect(resolved.links.map((link) => link.wikiArticleId)).toEqual([
          articles.manga.wikiArticleId,
        ])
        expect(unresolved.links).toEqual([])
      }),
  )
})
