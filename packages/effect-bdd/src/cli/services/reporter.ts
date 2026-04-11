import { Effect, Layer, Context } from "effect"

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
}

function formatStepPretty(step: MatchedStep, indent: string): string {
  const status = step.matched ? `${ANSI.green}✓${ANSI.reset}` : `${ANSI.red}✗${ANSI.reset}`
  const keyword = `${ANSI.dim}${step.step.keyword}${ANSI.reset}`
  const text = step.matched ? step.step.text : `${ANSI.red}${step.step.text}${ANSI.reset}`
  const undefinedHint = step.matched ? "" : ` ${ANSI.yellow}← NOT IMPLEMENTED${ANSI.reset}`

  return `${indent}${status} ${keyword} ${text}${undefinedHint}`
}

function formatScenarioPretty(scenario: ScenarioResult, indent: string): string {
  const lines: Array<string> = []
  const undefinedCount = scenario.steps.filter((s) => !s.matched).length
  const status = undefinedCount === 0 ? `${ANSI.green}✓${ANSI.reset}` : `${ANSI.red}✗${ANSI.reset}`

  const typeLabel =
    scenario.type === "ScenarioOutline"
      ? ` ${ANSI.dim}(Outline, ${scenario.examplesCount} examples)${ANSI.reset}`
      : ""

  lines.push(`${indent}${status} ${ANSI.bold}${scenario.name}${ANSI.reset}${typeLabel}`)

  for (const step of scenario.steps) {
    lines.push(formatStepPretty(step, `${indent}  `))
  }

  return lines.join("\n")
}

function formatRulePretty(rule: RuleResult, indent: string): string {
  const lines: Array<string> = []

  const totalUndefined = rule.scenarios.reduce(
    (acc, s) => acc + s.steps.filter((step) => !step.matched).length,
    rule.backgroundSteps?.filter((s) => !s.matched).length ?? 0,
  )

  const status = totalUndefined === 0 ? `${ANSI.green}✓${ANSI.reset}` : `${ANSI.red}✗${ANSI.reset}`
  lines.push(`${indent}${status} ${ANSI.bold}Rule: ${rule.name}${ANSI.reset}`)
  lines.push("")

  if (rule.backgroundSteps && rule.backgroundSteps.length > 0) {
    lines.push(`${indent}  ${ANSI.dim}Background:${ANSI.reset}`)
    for (const step of rule.backgroundSteps) {
      lines.push(formatStepPretty(step, `${indent}    `))
    }
    lines.push("")
  }

  for (const scenario of rule.scenarios) {
    lines.push(formatScenarioPretty(scenario, `${indent}  `))
    lines.push("")
  }

  return lines.join("\n")
}

function formatFeaturePretty(feature: FeatureResult): string {
  const lines: Array<string> = []

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
  lines.push(
    `${status} ${ANSI.bold}${feature.name}${ANSI.reset} ${ANSI.dim}(${feature.file})${ANSI.reset}`,
  )
  lines.push("")

  if (feature.backgroundSteps && feature.backgroundSteps.length > 0) {
    lines.push(`  ${ANSI.dim}Background:${ANSI.reset}`)
    for (const step of feature.backgroundSteps) {
      lines.push(formatStepPretty(step, "    "))
    }
    lines.push("")
  }

  for (const scenario of feature.scenarios) {
    lines.push(formatScenarioPretty(scenario, "  "))
    lines.push("")
  }

  for (const rule of feature.rules) {
    lines.push(formatRulePretty(rule, "  "))
  }

  return lines.join("\n")
}

function formatSummaryPretty(result: CheckResult): string {
  const status = result.passed
    ? `${ANSI.green}✓ All steps implemented${ANSI.reset}`
    : `${ANSI.red}✗ ${result.undefinedSteps} undefined step${result.undefinedSteps > 1 ? "s" : ""}${ANSI.reset}`

  return `\n${status}\n${ANSI.dim}${result.totalSteps} steps across ${result.features.length} feature${result.features.length > 1 ? "s" : ""}${ANSI.reset}\n`
}

function reportPretty(result: CheckResult): Effect.Effect<void> {
  return Effect.sync(() => {
    for (const feature of result.features) {
      console.log(formatFeaturePretty(feature))
    }
    console.log(formatSummaryPretty(result))
  })
}

function reportJson(result: CheckResult): Effect.Effect<void> {
  return Effect.sync(() => {
    console.log(JSON.stringify(result, null, 2))
  })
}

function reportUndefinedStepsGithubActions(
  scenarios: Array<ScenarioResult>,
  backgroundSteps: Array<MatchedStep> | undefined,
  featureFile: string,
  context?: string,
): Array<string> {
  const messages: Array<string> = []
  const prefix = context ? ` in rule "${context}"` : ""

  for (const scenario of scenarios) {
    for (const step of scenario.steps) {
      if (!step.matched) {
        messages.push(
          `::error file=${featureFile},line=${step.step.line}::Undefined step: "${step.step.keyword} ${step.step.text}" in scenario "${scenario.name}"${prefix}`,
        )
      }
    }
  }

  if (backgroundSteps) {
    for (const step of backgroundSteps) {
      if (!step.matched) {
        messages.push(
          `::error file=${featureFile},line=${step.step.line}::Undefined background step: "${step.step.keyword} ${step.step.text}"${prefix}`,
        )
      }
    }
  }

  return messages
}

function reportGithubActions(result: CheckResult): Effect.Effect<void> {
  return Effect.sync(() => {
    for (const feature of result.features) {
      for (const message of reportUndefinedStepsGithubActions(
        feature.scenarios,
        feature.backgroundSteps,
        feature.file,
      )) {
        console.log(message)
      }

      for (const rule of feature.rules) {
        for (const message of reportUndefinedStepsGithubActions(
          rule.scenarios,
          rule.backgroundSteps,
          feature.file,
          rule.name,
        )) {
          console.log(message)
        }
      }
    }

    if (result.undefinedSteps > 0) {
      console.log(
        `::error::${result.undefinedSteps} undefined step${result.undefinedSteps > 1 ? "s" : ""} found`,
      )
    }
  })
}

export function makeReporter(format: OutputFormat): Layer.Layer<Reporter> {
  return Layer.succeed(
    Reporter,
    Reporter.of({
      report: (result) => {
        switch (format) {
          case "json":
            return reportJson(result)
          case "github-actions":
            return reportGithubActions(result)
          case "pretty":
          default:
            return reportPretty(result)
        }
      },
    }),
  )
}
