import * as Gherkin from "@cucumber/gherkin"
import * as Messages from "@cucumber/messages"
import { BunServices } from "@effect/platform-bun"
import { Array as Arr, Effect, FileSystem, Path } from "effect"

import { FeatureParseError } from "../errors.js"
import type {
  ParsedBackground,
  ParsedFeature,
  ParsedRule,
  ParsedScenario,
  ParsedScenarioOutline,
  ParsedStep,
  StepKeyword,
} from "./types.js"

function normalizeKeyword(keyword: string): StepKeyword {
  const normalized = keyword.trim()
  switch (normalized) {
    case "Given":
    case "When":
    case "Then":
    case "And":
    case "But":
      return normalized
    case "*":
      return "And"
    default:
      return "Given"
  }
}

function parseDataTable(
  dataTable: Messages.DataTable | undefined,
): Array<Record<string, string>> | undefined {
  if (!dataTable || !dataTable.rows || dataTable.rows.length < 2) {
    return undefined
  }

  const headerRow = dataTable.rows[0]
  const headers = headerRow.cells.map((cell) => cell.value)

  return dataTable.rows.slice(1).map((row) => {
    const record: Record<string, string> = {}
    row.cells.forEach((cell, index) => {
      record[headers[index]] = cell.value
    })
    return record
  })
}

function parseStep(step: Messages.Step): ParsedStep {
  const dataTable = parseDataTable(step.dataTable)
  return {
    keyword: normalizeKeyword(step.keyword),
    line: step.location.line,
    text: step.text,
    ...(dataTable !== undefined && { dataTable }),
  }
}

function parseBackground(background: Messages.Background): ParsedBackground {
  return {
    steps: background.steps.map(parseStep),
  }
}

function parseScenario(scenario: Messages.Scenario): ParsedScenario {
  return {
    name: scenario.name,
    steps: scenario.steps.map(parseStep),
    ...(scenario.description !== undefined && { description: scenario.description }),
  }
}

function parseScenarioOutline(scenario: Messages.Scenario): ParsedScenarioOutline {
  const examples: Array<Record<string, string>> = []

  for (const exampleTable of scenario.examples) {
    if (!exampleTable.tableHeader || !exampleTable.tableBody) continue

    const headers = exampleTable.tableHeader.cells.map((cell) => cell.value)

    for (const row of exampleTable.tableBody) {
      const example: Record<string, string> = {}
      row.cells.forEach((cell, index) => {
        example[headers[index]] = cell.value
      })
      examples.push(example)
    }
  }

  return {
    examples,
    name: scenario.name,
    steps: scenario.steps.map(parseStep),
    ...(scenario.description !== undefined && { description: scenario.description }),
  }
}

function parseRule(rule: Messages.Rule): ParsedRule {
  const scenarios: Array<ParsedScenario> = []
  const scenarioOutlines: Array<ParsedScenarioOutline> = []
  let background: ParsedBackground | undefined

  for (const child of rule.children) {
    if (child.background) {
      background = parseBackground(child.background)
    } else if (child.scenario) {
      if (Arr.isReadonlyArrayNonEmpty(child.scenario.examples ?? [])) {
        scenarioOutlines.push(parseScenarioOutline(child.scenario))
      } else {
        scenarios.push(parseScenario(child.scenario))
      }
    }
  }

  return {
    name: rule.name,
    scenarioOutlines,
    scenarios,
    ...(background !== undefined && { background }),
    ...(rule.description !== undefined && { description: rule.description }),
  }
}

function parseGherkinDocument(document: Messages.GherkinDocument): ParsedFeature {
  const feature = document.feature
  if (!feature) {
    throw new Error("No feature found in document")
  }

  const scenarios: Array<ParsedScenario> = []
  const scenarioOutlines: Array<ParsedScenarioOutline> = []
  const rules: Array<ParsedRule> = []
  let background: ParsedBackground | undefined

  for (const child of feature.children) {
    if (child.background) {
      background = parseBackground(child.background)
    } else if (child.scenario) {
      if (Arr.isReadonlyArrayNonEmpty(child.scenario.examples ?? [])) {
        scenarioOutlines.push(parseScenarioOutline(child.scenario))
      } else {
        scenarios.push(parseScenario(child.scenario))
      }
    } else if (child.rule) {
      rules.push(parseRule(child.rule))
    }
  }

  return {
    name: feature.name,
    rules,
    scenarioOutlines,
    scenarios,
    ...(background !== undefined && { background }),
    ...(feature.description !== undefined && { description: feature.description }),
  }
}

export function parseFeatureFile(
  featurePath: string,
): Effect.Effect<ParsedFeature, FeatureParseError, FileSystem.FileSystem | Path.Path> {
  return Effect.gen(function* () {
    const fileSystem = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const resolvedPath = path.resolve(process.cwd(), featurePath)
    const content = yield* fileSystem.readFileString(resolvedPath).pipe(
      Effect.mapError(
        (error) =>
          new FeatureParseError({
            message: error instanceof Error ? error.message : String(error),
            path: featurePath,
          }),
      ),
    )

    return yield* Effect.try({
      catch: (error) =>
        new FeatureParseError({
          message: error instanceof Error ? error.message : String(error),
          path: featurePath,
        }),
      try: () => {
        const uuidFn = Messages.IdGenerator.uuid()
        const builder = new Gherkin.AstBuilder(uuidFn)
        const matcher = new Gherkin.GherkinClassicTokenMatcher()
        const parser = new Gherkin.Parser(builder, matcher)

        const document = parser.parse(content)
        return parseGherkinDocument(document)
      },
    })
  })
}

export function parseFeatureFileSync(featurePath: string): ParsedFeature {
  return Effect.runSync(parseFeatureFile(featurePath).pipe(Effect.provide(BunServices.layer)))
}
