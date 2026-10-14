import {
  Array as EffectArray,
  Console,
  Context,
  Effect,
  Layer,
  Match,
  Option,
  Schema,
} from "effect"

import type {
  CheckResult,
  FeatureResult,
  MatchedStep,
  OutputFormat,
  RuleResult,
  ScenarioResult,
} from "../types.js"

export class Reporter extends Context.Service<
  Reporter,
  {
    report: (result: CheckResult) => Effect.Effect<void>
  }
>()("Reporter") {}

const ANSI = {
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  reset: "\x1b[0m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
}

function formatStepPretty(step: MatchedStep, indent: string): string {
  const status = step.matched ? `${ANSI.green}✓${ANSI.reset}` : `${ANSI.red}✗${ANSI.reset}`
  const keyword = `${ANSI.dim}${step.step.keyword}${ANSI.reset}`
  const text = step.matched ? step.step.text : `${ANSI.red}${step.step.text}${ANSI.reset}`
  const undefinedHint = step.matched ? "" : ` ${ANSI.yellow}← NOT IMPLEMENTED${ANSI.reset}`

  return `${indent}${status} ${keyword} ${text}${undefinedHint}`
}

function formatScenarioPretty(scenario: ScenarioResult, indent: string): string {
  const undefinedCount = scenario.steps.filter((s) => !s.matched).length
  const status = undefinedCount === 0 ? `${ANSI.green}✓${ANSI.reset}` : `${ANSI.red}✗${ANSI.reset}`

  const typeLabel =
    scenario.type === "ScenarioOutline"
      ? ` ${ANSI.dim}(Outline, ${scenario.examplesCount} examples)${ANSI.reset}`
      : ""

  return [
    `${indent}${status} ${ANSI.bold}${scenario.name}${ANSI.reset}${typeLabel}`,
    ...scenario.steps.map((step) => formatStepPretty(step, `${indent}  `)),
  ].join("\n")
}

function formatRulePretty(rule: RuleResult, indent: string): string {
  const totalUndefined = rule.scenarios.reduce(
    (acc, s) => acc + s.steps.filter((step) => !step.matched).length,
    rule.backgroundSteps?.filter((s) => !s.matched).length ?? 0,
  )

  const status = totalUndefined === 0 ? `${ANSI.green}✓${ANSI.reset}` : `${ANSI.red}✗${ANSI.reset}`

  const backgroundLines = EffectArray.isReadonlyArrayNonEmpty(rule.backgroundSteps ?? [])
    ? [
        `${indent}  ${ANSI.dim}Background:${ANSI.reset}`,
        ...(rule.backgroundSteps ?? []).map((step) => formatStepPretty(step, `${indent}    `)),
        "",
      ]
    : []

  return [
    `${indent}${status} ${ANSI.bold}Rule: ${rule.name}${ANSI.reset}`,
    "",
    ...backgroundLines,
    ...rule.scenarios.flatMap((scenario) => [formatScenarioPretty(scenario, `${indent}  `), ""]),
  ].join("\n")
}

function formatFeaturePretty(feature: FeatureResult): string {
  const topLevelUndefined = feature.scenarios.reduce(
    (acc, s) => acc + s.steps.filter((step) => !step.matched).length,
    feature.backgroundSteps?.filter((s) => !s.matched).length ?? 0,
  )

  const rulesUndefined = feature.rules.reduce(
    (acc, rule) =>
      acc +
      rule.scenarios.reduce(
        (rAcc, s) => rAcc + s.steps.filter((step) => !step.matched).length,
        rule.backgroundSteps?.filter((s) => !s.matched).length ?? 0,
      ),
    0,
  )

  const totalUndefined = topLevelUndefined + rulesUndefined

  const status = totalUndefined === 0 ? `${ANSI.green}✓${ANSI.reset}` : `${ANSI.red}✗${ANSI.reset}`

  const backgroundLines = EffectArray.isReadonlyArrayNonEmpty(feature.backgroundSteps ?? [])
    ? [
        "  " + ANSI.dim + "Background:" + ANSI.reset,
        ...(feature.backgroundSteps ?? []).map((step) => formatStepPretty(step, "    ")),
        "",
      ]
    : []

  return [
    `${status} ${ANSI.bold}${feature.name}${ANSI.reset} ${ANSI.dim}(${feature.file})${ANSI.reset}`,
    "",
    ...backgroundLines,
    ...feature.scenarios.flatMap((scenario) => [formatScenarioPretty(scenario, "  "), ""]),
    ...feature.rules.map((rule) => formatRulePretty(rule, "  ")),
  ].join("\n")
}

function formatSummaryPretty(result: CheckResult): string {
  const status = result.passed
    ? `${ANSI.green}✓ All steps implemented${ANSI.reset}`
    : `${ANSI.red}✗ ${result.undefinedSteps} undefined step${result.undefinedSteps > 1 ? "s" : ""}${ANSI.reset}`

  return `\n${status}\n${ANSI.dim}${result.totalSteps} steps across ${result.features.length} feature${result.features.length > 1 ? "s" : ""}${ANSI.reset}\n`
}

function reportPretty(result: CheckResult): Effect.Effect<void> {
  return Effect.forEach(
    [...result.features.map(formatFeaturePretty), formatSummaryPretty(result)],
    Console.log,
    { discard: true, concurrency: 1 },
  )
}

function reportMissingSteps(result: CheckResult): Effect.Effect<void> {
  const color = (value: string, ...codes: Array<string>) => `${codes.join("")}${value}${ANSI.reset}`

  const previewSteps = (steps: Array<MatchedStep>): Array<string> => {
    const missingSteps = steps.filter((step) => !step.matched)

    const preview = missingSteps
      .slice(0, 3)
      .map(
        (step) =>
          `    ${color("✗", ANSI.red)} ${step.step.keyword} ${step.step.text} ${color(`(line ${step.step.line})`, ANSI.dim)}`,
      )

    if (missingSteps.length > preview.length) {
      preview.push(
        `    ${color(`… ${missingSteps.length - preview.length} more missing steps`, ANSI.dim)}`,
      )
    }

    return preview
  }

  const messages = result.features.flatMap((feature) => {
    const formatScenarios = (scenarios: Array<ScenarioResult>, indent: string): Array<string> =>
      scenarios.flatMap((scenario) => {
        const steps = previewSteps(scenario.steps)

        return EffectArray.match(steps, {
          onEmpty: () => [],
          onNonEmpty: (steps) => [
            `${indent}${color("✗", ANSI.red)} ${color(scenario.name, ANSI.bold)}`,
            ...steps,
          ],
        })
      })

    const scenarios = [
      ...formatScenarios(feature.scenarios, "  "),
      ...feature.rules.flatMap((rule) => {
        const failingScenarios = formatScenarios(rule.scenarios, "    ")

        const background = previewSteps(rule.backgroundSteps ?? []).map((step) => `  ${step}`)

        return EffectArray.match(failingScenarios, {
          onEmpty: () =>
            EffectArray.match(background, {
              onEmpty: () => [],
              onNonEmpty: (background) => [
                `  ${color(`Rule: ${rule.name}`, ANSI.cyan, ANSI.bold)}`,
                `    ${color("Background", ANSI.dim)}`,
                ...background,
              ],
            }),
          onNonEmpty: (failingScenarios) => [
            `  ${color(`Rule: ${rule.name}`, ANSI.cyan, ANSI.bold)}`,
            ...EffectArray.match(background, {
              onEmpty: () => [],
              onNonEmpty: (background) => [`    ${color("Background", ANSI.dim)}`, ...background],
            }),
            ...failingScenarios,
          ],
        })
      }),
    ]

    const backgroundSteps = previewSteps(feature.backgroundSteps ?? [])

    return EffectArray.match(scenarios, {
      onEmpty: () =>
        EffectArray.match(backgroundSteps, {
          onEmpty: () => [],
          onNonEmpty: (backgroundSteps) => [
            color(`▸ ${feature.file}`, ANSI.bold, ANSI.cyan),
            color(`  ${feature.name}`, ANSI.dim),
            `  ${color("Background", ANSI.dim)}`,
            ...backgroundSteps,
            "",
          ],
        }),
      onNonEmpty: (scenarios) => [
        color(`▸ ${feature.file}`, ANSI.bold, ANSI.cyan),
        color(`  ${feature.name}`, ANSI.dim),
        ...EffectArray.match(backgroundSteps, {
          onEmpty: () => [],
          onNonEmpty: (backgroundSteps) => [
            `  ${color("Background", ANSI.dim)}`,
            ...backgroundSteps,
          ],
        }),
        ...scenarios,
        "",
      ],
    })
  })

  return Effect.forEach(messages, (message) => Console.log(message), {
    discard: true,
    concurrency: 1,
  })
}

function reportJson(result: CheckResult): Effect.Effect<void> {
  return Console.log(Schema.encodeSync(Schema.fromJsonString(Schema.Unknown))(result))
}

function reportUndefinedStepsGithubActions({
  scenarios,
  backgroundSteps,
  featureFile,
  context,
}: {
  scenarios: Array<ScenarioResult>
  backgroundSteps: Option.Option<Array<MatchedStep>>
  featureFile: string
  context?: string | undefined
}): Array<string> {
  const prefix = context ? ` in rule "${context}"` : ""

  return [
    ...scenarios.flatMap((scenario) =>
      scenario.steps
        .filter((step) => !step.matched)
        .map(
          (step) =>
            `::error file=${featureFile},line=${step.step.line}::Undefined step: "${step.step.keyword} ${step.step.text}" in scenario "${scenario.name}"${prefix}`,
        ),
    ),
    ...EffectArray.fromOption(backgroundSteps).flatMap((steps) =>
      steps
        .filter((step) => !step.matched)
        .map(
          (step) =>
            `::error file=${featureFile},line=${step.step.line}::Undefined background step: "${step.step.keyword} ${step.step.text}"${prefix}`,
        ),
    ),
  ]
}

function reportGithubActions(result: CheckResult): Effect.Effect<void> {
  const messages = result.features.flatMap((feature) => [
    ...reportUndefinedStepsGithubActions({
      scenarios: feature.scenarios,
      backgroundSteps: Option.fromNullishOr(feature.backgroundSteps),
      featureFile: feature.file,
    }),
    ...feature.rules.flatMap((rule) =>
      reportUndefinedStepsGithubActions({
        scenarios: rule.scenarios,
        backgroundSteps: Option.fromNullishOr(rule.backgroundSteps),
        featureFile: feature.file,
        context: rule.name,
      }),
    ),
  ])

  return Effect.forEach(
    result.undefinedSteps > 0
      ? [
          ...messages,
          `::error::${result.undefinedSteps} undefined step${result.undefinedSteps > 1 ? "s" : ""} found`,
        ]
      : messages,
    Console.log,
    { discard: true, concurrency: 1 },
  )
}

export function makeReporter(format: OutputFormat, quiet = false): Layer.Layer<Reporter> {
  return Layer.succeed(
    Reporter,
    Reporter.of({
      report: (result) => {
        if (quiet) return reportMissingSteps(result)

        return Match.value(format).pipe(
          Match.when("json", () => reportJson(result)),
          Match.when("github-actions", () => reportGithubActions(result)),
          Match.when("pretty", () => reportPretty(result)),
          Match.exhaustive,
        )
      },
    }),
  )
}
