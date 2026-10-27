/**
 * Measures link inference against the hand-labelled evaluation set with a real language model.
 * Run with `pnpm --filter @gororobas/server test:external`; tune prompts against these numbers.
 */
import { NodeFileSystem } from "@effect/platform-node"
import { describe, expect, it } from "@effect/vitest"
import {
  LinkInferenceModel,
  LinkInferenceModelStub,
  makeAliasIndex,
  publicationSourceText,
  TiptapDocument,
  TiptapNodeId,
  WikiArticleId,
  type WikiArticleKind,
} from "@gororobas/domain"
import { Clock, Config, Effect, FileSystem, HashMap, Layer, Option, Record } from "effect"

import { inferLinks } from "./infer-links.js"
import { LinkInferenceLanguageModel, LinkInferenceModelLive } from "./link-inference-model-live.js"
import { LINK_INFERENCE_VERSION } from "./link-inference-version.js"
import {
  type EvaluationArticle,
  evaluationArticles,
  evaluationCases,
} from "./link-inference.evaluation-set.js"

const keys: ReadonlyArray<EvaluationArticle> = Record.keys(evaluationArticles)
const idOf = (key: EvaluationArticle) =>
  WikiArticleId.make(`019a0000-0000-7000-8000-${String(keys.indexOf(key) + 1).padStart(12, "0")}`)
const keyOf = HashMap.fromIterable(keys.map((key) => [idOf(key), key] as const))

const aliases = makeAliasIndex(
  keys.flatMap((key) => {
    const { kind, names }: { kind: WikiArticleKind; names: ReadonlyArray<string> } =
      evaluationArticles[key]
    return names.map((alias) => ({ wikiArticleId: idOf(key), kind, alias }))
  }),
)

interface Counts {
  truePositives: number
  falsePositives: number
  falseNegatives: number
}

const score = (counts: Counts) => ({
  ...counts,
  precision: counts.truePositives / Math.max(counts.truePositives + counts.falsePositives, 1),
  recall: counts.truePositives / Math.max(counts.truePositives + counts.falseNegatives, 1),
  f1:
    (2 * counts.truePositives) /
    Math.max(2 * counts.truePositives + counts.falsePositives + counts.falseNegatives, 1),
})

const compare = (
  expected: ReadonlyArray<EvaluationArticle>,
  found: ReadonlyArray<EvaluationArticle>,
): Counts => ({
  truePositives: found.filter((key) => expected.includes(key)).length,
  falsePositives: found.filter((key) => !expected.includes(key)).length,
  falseNegatives: expected.filter((key) => !found.includes(key)).length,
})

const add = (left: Counts, right: Counts): Counts => ({
  truePositives: left.truePositives + right.truePositives,
  falsePositives: left.falsePositives + right.falsePositives,
  falseNegatives: left.falseNegatives + right.falseNegatives,
})

describe(
  "link inference quality (external: run with `pnpm --filter @gororobas/server test:external`)",
  { timeout: 900_000 },
  () => {
    it.live("reports mention and inference precision and recall over the evaluation set", () =>
      Effect.gen(function* () {
        const model = yield* LinkInferenceModel
        const reportPath = yield* Config.String("LINK_INFERENCE_EVAL_REPORT").pipe(Config.option)

        const results = yield* Effect.forEach(
          evaluationCases,
          (evaluationCase) =>
            Effect.gen(function* () {
              const source = publicationSourceText({
                sourceContent: TiptapDocument.make({
                  type: "doc",
                  version: 1,
                  content: evaluationCase.paragraphs.map((text, index) => ({
                    type: "paragraph",
                    attrs: {
                      nodeId: TiptapNodeId.make(`paragraph${String(index).padStart(3, "0")}`),
                    },
                    content: [{ type: "text", text }],
                  })),
                }),
              })

              const request = { source, context: Option.none(), aliases, exclude: Option.none() }
              const dictionary = yield* inferLinks(request).pipe(
                Effect.provide(LinkInferenceModelStub),
              )
              const startedAt = yield* Clock.currentTimeMillis
              const { links, suggestions } = yield* inferLinks(request)
              const durationMilliseconds = (yield* Clock.currentTimeMillis) - startedAt

              const found = (linkSource: "MENTION" | "INFERENCE") =>
                links.flatMap((link) =>
                  link.source === linkSource
                    ? Option.toArray(HashMap.get(keyOf, link.wikiArticleId))
                    : [],
                )

              const mentions = found("MENTION")
              const inferences = found("INFERENCE")
              const dictionaryMentions = dictionary.links.flatMap((link) =>
                Option.toArray(HashMap.get(keyOf, link.wikiArticleId)),
              )

              const differences = (
                expected: ReadonlyArray<EvaluationArticle>,
                actual: ReadonlyArray<EvaluationArticle>,
              ) => ({
                missing: expected.filter((key) => !actual.includes(key)),
                unexpected: actual.filter((key) => !expected.includes(key)),
              })

              const details = {
                name: evaluationCase.name,
                language: evaluationCase.language,
                paragraphs: evaluationCase.paragraphs,
                durationMilliseconds,
                expected: {
                  mentions: evaluationCase.mentions,
                  inferences: evaluationCase.inferences,
                },
                found: { mentions, inferences, dictionaryMentions },
                errors: {
                  mentions: differences(evaluationCase.mentions, mentions),
                  inferences: differences(evaluationCase.inferences, inferences),
                },
                evidence: links.map((link) => ({
                  article: Option.getOrThrow(HashMap.get(keyOf, link.wikiArticleId)),
                  source: link.source,
                  evidence: link.evidence,
                })),
                suggestions,
              }

              yield* Effect.logInfo(JSON.stringify(details))

              return {
                details,
                dictionary: compare(evaluationCase.mentions, dictionaryMentions),
                mentions: compare(evaluationCase.mentions, mentions),
                inferences: compare(evaluationCase.inferences, inferences),
              }
            }),
          { concurrency: 1 },
        )

        const empty: Counts = { truePositives: 0, falsePositives: 0, falseNegatives: 0 }
        const mentions = results.map((result) => result.mentions).reduce(add, empty)
        const inferences = results.map((result) => result.inferences).reduce(add, empty)

        const report = {
          model: model.model,
          inferenceVersion: LINK_INFERENCE_VERSION,
          temperature: yield* Config.Number("LINK_INFERENCE_TEMPERATURE").pipe(
            Config.withDefault(0),
          ),
          cases: results.map((result) => result.details),
          scores: {
            dictionary: score(results.map((result) => result.dictionary).reduce(add, empty)),
            mentions: score(mentions),
            inferences: score(inferences),
          },
        }

        yield* Effect.logInfo("Link inference scores", report.scores)

        if (Option.isSome(reportPath)) {
          const fileSystem = yield* FileSystem.FileSystem
          yield* fileSystem.writeFileString(
            reportPath.value,
            JSON.stringify(report, null, 2) + "\n",
          )
        }

        // Floors that catch a broken pipeline; tune prompts against the logged scores.
        expect(score(mentions).recall).toBeGreaterThan(0.5)
        expect(score(inferences).recall).toBeGreaterThan(0)
      }).pipe(
        Effect.provide([
          LinkInferenceModelLive.pipe(Layer.provide(LinkInferenceLanguageModel)),
          NodeFileSystem.layer,
        ]),
      ),
    )
  },
)
