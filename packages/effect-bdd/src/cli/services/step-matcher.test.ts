import { expect, it } from "@effect/vitest"
import { Effect } from "effect"

import type { ParsedFeature } from "../../parser/types.js"
import { StepMatcher, StepMatcherLive } from "./step-matcher.js"

it.effect("outline matching substitutes every example before validating typed placeholders", () =>
  Effect.gen(function* () {
    const matcher = yield* StepMatcher

    const feature: ParsedFeature = {
      name: "Invitation expiration",
      rules: [],
      scenarios: [],
      scenarioOutlines: [
        {
          name: "Valid examples",
          steps: [
            { keyword: "When", line: 3, text: '"Teresa" accepts after <delay> milliseconds' },
          ],
          examples: [{ delay: "1209599999" }, { delay: "1209600000" }],
        },
        {
          name: "Invalid example",
          steps: [
            { keyword: "When", line: 8, text: '"Teresa" accepts after <delay> milliseconds' },
          ],
          examples: [{ delay: "1209599999" }, { delay: "tomorrow" }],
        },
        {
          name: "No examples",
          steps: [
            { keyword: "When", line: 13, text: '"Teresa" accepts after <delay> milliseconds' },
          ],
          examples: [],
        },
      ],
    }

    const result = yield* matcher.checkFeature({
      feature,
      featurePath: "invitations.feature",
      discoveredSteps: [
        {
          keyword: "When",
          file: "invitations.test.ts",
          line: 1,
          pattern: "{string:person} accepts after {int:elapsed} milliseconds",
        },
      ],
    })

    expect(result.scenarios.map((scenario) => scenario.steps.map((step) => step.matched))).toEqual([
      [true],
      [false],
      [false],
    ])
  }).pipe(Effect.provide(StepMatcherLive)),
)
