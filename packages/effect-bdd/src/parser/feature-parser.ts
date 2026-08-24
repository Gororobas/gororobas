import * as Gherkin from "@cucumber/gherkin"
import * as Messages from "@cucumber/messages"
import { NodeServices } from "@effect/platform-node"
import { Array as EffectArray, Effect, FileSystem, Option, Path } from "effect"

import { FeatureParseError } from "../errors.js"
import type {
  ParsedFeature,
  ParsedBackground,
  ParsedRule,
  ParsedScenario,
  ParsedScenarioOutline,
  ParsedStep,
  StepKeyword,
} from "./types.js"

function normalizeKeyword(keyword: string): StepKeyword {
  const normalized = keyword.trim()
  const keywordValue = Option.fromNullishOr(
    ["Given", "When", "Then", "And", "But"].find(
      (value): value is StepKeyword => value === normalized,
    ),
  )
  return Option.getOrElse(keywordValue, () => (normalized === "*" ? "And" : "Given"))
}

function parseDataTable(
  dataTable: Option.Option<Messages.DataTable>,
): Option.Option<Array<Record<string, string>>> {
  if (Option.isNone(dataTable) || !dataTable.value.rows || dataTable.value.rows.length < 2) {
    return Option.none()
  }

  const headerRow = dataTable.value.rows[0]
  const headers = headerRow.cells.map((cell) => cell.value)

  return Option.some(
    dataTable.value.rows.slice(1).map((row) => {
      const record: Record<string, string> = {}
      row.cells.forEach((cell, index) => {
        record[headers[index]] = cell.value
      })
      return record
    }),
  )
}

function parseStep(step: Messages.Step): ParsedStep {
  const dataTable = parseDataTable(Option.fromNullishOr(step.dataTable))
  return {
    keyword: normalizeKeyword(step.keyword),
    line: step.location.line,
    text: step.text,
    ...Option.match(dataTable, {
      onNone: () => ({}),
      onSome: (value) => ({ dataTable: value }),
    }),
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
  const examples = scenario.examples.flatMap((exampleTable) => {
    if (!exampleTable.tableHeader || !exampleTable.tableBody) return []
    const headers = exampleTable.tableHeader.cells.map((cell) => cell.value)
    return exampleTable.tableBody.map((row) =>
      row.cells.reduce<Record<string, string>>(
        (example, cell, index) => ({ ...example, [headers[index]]: cell.value }),
        {},
      ),
    )
  })

  return {
    examples,
    name: scenario.name,
    steps: scenario.steps.map(parseStep),
    ...(scenario.description !== undefined && { description: scenario.description }),
  }
}

function parseBackground(background: Messages.Background): ParsedBackground {
  return { steps: background.steps.map(parseStep) }
}

function parseRule(rule: Messages.Rule): ParsedRule {
  const background = Option.fromNullishOr(rule.children.find((child) => child.background)).pipe(
    Option.flatMap((child) => Option.fromNullishOr(child.background)),
    Option.map(parseBackground),
  )
  const scenarios = rule.children.flatMap((child) =>
    child.scenario && !EffectArray.isReadonlyArrayNonEmpty(child.scenario.examples ?? [])
      ? [parseScenario(child.scenario)]
      : [],
  )
  const scenarioOutlines = rule.children.flatMap((child) =>
    child.scenario && EffectArray.isReadonlyArrayNonEmpty(child.scenario.examples ?? [])
      ? [parseScenarioOutline(child.scenario)]
      : [],
  )

  return {
    name: rule.name,
    scenarioOutlines,
    scenarios,
    ...Option.match(background, { onNone: () => ({}), onSome: (value) => ({ background: value }) }),
    ...(rule.description !== undefined && { description: rule.description }),
  }
}

function parseGherkinDocument(document: Messages.GherkinDocument): ParsedFeature {
  const feature = document.feature
  if (!feature) {
    throw new FeatureParseError({ message: "No feature found in document", path: "" })
  }

  const background = Option.fromNullishOr(feature.children.find((child) => child.background)).pipe(
    Option.flatMap((child) => Option.fromNullishOr(child.background)),
    Option.map(parseBackground),
  )
  const scenarios = feature.children.flatMap((child) =>
    child.scenario && !EffectArray.isReadonlyArrayNonEmpty(child.scenario.examples ?? [])
      ? [parseScenario(child.scenario)]
      : [],
  )
  const scenarioOutlines = feature.children.flatMap((child) =>
    child.scenario && EffectArray.isReadonlyArrayNonEmpty(child.scenario.examples ?? [])
      ? [parseScenarioOutline(child.scenario)]
      : [],
  )
  const rules = feature.children.flatMap((child) => (child.rule ? [parseRule(child.rule)] : []))

  return {
    name: feature.name,
    rules,
    scenarioOutlines,
    scenarios,
    ...Option.match(background, { onNone: () => ({}), onSome: (value) => ({ background: value }) }),
    ...(feature.description !== undefined && { description: feature.description }),
  }
}

export function parseFeatureFile(
  featurePath: string,
  basePath = process.cwd(),
): Effect.Effect<ParsedFeature, FeatureParseError, FileSystem.FileSystem | Path.Path> {
  return Effect.gen(function* () {
    const fileSystem = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const resolvedPath = path.resolve(basePath, featurePath)
    const content = yield* fileSystem.readFileString(resolvedPath).pipe(
      Effect.mapError(
        (error) =>
          new FeatureParseError({
            message: error.message,
            path: featurePath,
          }),
      ),
    )

    return yield* Effect.try({
      catch: (error) =>
        new FeatureParseError({
          message: String(error),
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

export function parseFeatureFileSync(featurePath: string, basePath = process.cwd()): ParsedFeature {
  return Effect["runSync"](
    parseFeatureFile(featurePath, basePath).pipe(Effect.provide(NodeServices.layer)),
  )
}
