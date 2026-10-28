import { NodeServices } from "@effect/platform-node"
import { expect, it } from "@effect/vitest"
import { Effect, FileSystem, Layer, Path } from "effect"

import { StepDiscovery, StepDiscoveryLive } from "./step-discovery.js"
import { StepMatcher, StepMatcherLive } from "./step-matcher.js"

it.effect(
  "local step factories resolve arguments and defaults at their call site without executing tests",
  () =>
    Effect.gen(function* () {
      const filesystem = yield* FileSystem.FileSystem
      const path = yield* Path.Path
      const directory = yield* filesystem.makeTempDirectoryScoped({ prefix: "bdd-discovery-" })
      const file = path.join(directory, "helpers.test.ts")

      yield* filesystem.writeFileString(
        file,
        `
      throw new Error("Discovery must never execute test modules")
      const step = (keyword, pattern) => keyword(pattern, {})
      const configured = ({ keyword = Then, pattern }) => step(keyword, pattern)
      const nested = (pattern) => configured({ pattern })
      const defaulted = ({ keyword = Then, pattern = "unknown options default" }) => step(keyword, pattern)
      function conditional(visitor = false) {
        return When(visitor ? "visitor action" : "member action", {})
      }
      const unused = () => step(Then, "unused helper")
      const recursive = () => recursive()
      const unknown = (flag) => Then(flag ? "unknown true" : "unknown false", {})
      Background({ steps: () => runSteps(step(Given, "background")) })
      Scenario("First", { steps: () => runSteps(
        step(Given, "first"),
        configured({ keyword: When, pattern: "configured" }),
        conditional(), nested("nested"), recursive(), unknown(getFlag()), conditional(getFlag()), defaulted(getOptions()),
      ) })
      Scenario("Second", { steps: () => runSteps(conditional(true)) })
      ScenarioOutline("Outline", { steps: () => runSteps(nested("outline")) })
      Then("direct literal", {})
      const referenced = () => step(Then, "referenced callback")
      Scenario("Referenced", { steps: referenced })
      const visitor = () => Given("visitor", {})
      const member = () => Given("member", {})
      const cases = [["Visitor case", visitor], ["Member case", member]] as const
      cases.forEach(([title, actor]) => {
        Scenario(title, { steps: () => runSteps(actor()) })
      })
    `,
      )

      const discovery = yield* StepDiscovery
      const steps = discovery.discoverSteps([file])

      expect(steps.map(({ keyword, pattern, scope }) => ({ keyword, pattern, scope }))).toEqual([
        { keyword: "Given", pattern: "background", scope: { type: "background" } },
        { keyword: "Given", pattern: "first", scope: { type: "scenario", name: "First" } },
        { keyword: "When", pattern: "configured", scope: { type: "scenario", name: "First" } },
        { keyword: "When", pattern: "member action", scope: { type: "scenario", name: "First" } },
        { keyword: "Then", pattern: "nested", scope: { type: "scenario", name: "First" } },
        { keyword: "When", pattern: "visitor action", scope: { type: "scenario", name: "Second" } },
        {
          keyword: "Then",
          pattern: "outline",
          scope: { type: "scenario_outline", name: "Outline" },
        },
        { keyword: "Then", pattern: "direct literal", scope: undefined },
        {
          keyword: "Then",
          pattern: "referenced callback",
          scope: { type: "scenario", name: "Referenced" },
        },
        { keyword: "Given", pattern: "visitor", scope: { type: "scenario", name: "Visitor case" } },
        { keyword: "Given", pattern: "member", scope: { type: "scenario", name: "Member case" } },
      ])

      expect(steps.every((step) => step.file === file && step.line > 0)).toBe(true)

      const matcher = yield* StepMatcher

      const checked = yield* matcher.checkFeature({
        featurePath: "helpers.feature",
        discoveredSteps: steps,
        feature: {
          name: "Helpers",
          rules: [],
          scenarioOutlines: [],
          scenarios: [
            { name: "First", steps: [{ keyword: "When", line: 1, text: "member action" }] },
            { name: "Second", steps: [{ keyword: "When", line: 2, text: "member action" }] },
          ],
        },
      })

      expect(checked.scenarios.map((scenario) => scenario.steps[0]?.matched)).toEqual([true, false])
    }).pipe(
      Effect.scoped,
      Effect.provide(Layer.mergeAll(StepDiscoveryLive, StepMatcherLive, NodeServices.layer)),
    ),
)
