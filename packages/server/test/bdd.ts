import { describe, it } from "@effect/vitest"
import type { StepTag } from "@gororobas/effect-bdd"
import {
  And,
  But,
  Given,
  type ParsedFeature,
  type ParsedRule,
  type ParsedScenario,
  type ParsedScenarioOutline,
  type ParsedStep,
  parseFeatureFileSync,
  type Step,
  Then,
  When,
} from "@gororobas/effect-bdd"
import { Effect } from "effect"

import { AppSqlTest } from "../src/sql.js"

export const NotImplementedError = new Error("NotImplemented")

export const makeTestLayer = () => AppSqlTest

export const notImplemented = <Ctx>(_ctx: Ctx) => Effect.fail(NotImplementedError)

const stepConstructorByTag: Record<StepTag, typeof Given> = {
  And,
  But,
  Given,
  Then,
  When,
}

export const createFailingSteps = (
  parsedSteps: ReadonlyArray<ParsedStep>,
): ReadonlyArray<Step<unknown, unknown, unknown, unknown>> =>
  parsedSteps.map((parsedStep) =>
    stepConstructorByTag[parsedStep.keyword](parsedStep.text, {
      handler: () => Effect.fail(NotImplementedError),
    }),
  )

const describeParsedScenario = (scenario: ParsedScenario, layer = makeTestLayer()): void => {
  it.effect(scenario.name, () => Effect.fail(NotImplementedError).pipe(Effect.provide(layer)))
}

const describeParsedScenarioOutline = (
  outline: ParsedScenarioOutline,
  layer = makeTestLayer(),
): void => {
  describe(outline.name, () => {
    outline.examples.forEach((example, index) => {
      const label = Object.entries(example)
        .map(([k, v]) => `${k}=${String(v)}`)
        .join(", ")

      it.effect(`Example ${index + 1}: ${label}`, () =>
        Effect.fail(NotImplementedError).pipe(Effect.provide(layer)),
      )
    })
  })
}

const describeParsedRule = (rule: ParsedRule): void => {
  describe(rule.name, () => {
    rule.scenarios.forEach((scenario) => describeParsedScenario(scenario))
    rule.scenarioOutlines.forEach((outline) => describeParsedScenarioOutline(outline))
  })
}

const describeParsedFeature = (feature: ParsedFeature): void => {
  describe(feature.name, () => {
    feature.scenarios.forEach((scenario) => describeParsedScenario(scenario))
    feature.scenarioOutlines.forEach((outline) => describeParsedScenarioOutline(outline))
    feature.rules.forEach((rule) => describeParsedRule(rule))
  })
}

export const describeFailingFeature = (featurePath: string): void => {
  const feature = parseFeatureFileSync(featurePath)
  describeParsedFeature(feature)
}
