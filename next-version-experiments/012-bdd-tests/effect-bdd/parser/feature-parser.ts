import * as Gherkin from '@cucumber/gherkin'
import * as Messages from '@cucumber/messages'
import { Effect } from 'effect'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { FeatureParseError } from '../errors'
import type {
  ParsedBackground,
  ParsedFeature,
  ParsedRule,
  ParsedScenario,
  ParsedScenarioOutline,
  ParsedStep,
  StepKeyword,
} from './types'

function normalizeKeyword(keyword: string): StepKeyword {
  const normalized = keyword.trim()
  switch (normalized) {
    case 'Given':
    case 'When':
    case 'Then':
    case 'And':
    case 'But':
      return normalized
    case '*':
      return 'And'
    default:
      return 'Given'
  }
}

function parseDataTable(
  dataTable: Messages.DataTable | undefined,
): Record<string, string>[] | undefined {
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
  return {
    keyword: normalizeKeyword(step.keyword),
    text: step.text,
    dataTable: parseDataTable(step.dataTable),
  }
}

function parseBackground(
  background: Messages.Background,
): ParsedBackground {
  return {
    steps: background.steps.map(parseStep),
  }
}

function parseScenario(scenario: Messages.Scenario): ParsedScenario {
  return {
    name: scenario.name,
    description: scenario.description || undefined,
    steps: scenario.steps.map(parseStep),
  }
}

function parseScenarioOutline(
  scenario: Messages.Scenario,
): ParsedScenarioOutline {
  const examples: Record<string, string>[] = []

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
    name: scenario.name,
    description: scenario.description || undefined,
    steps: scenario.steps.map(parseStep),
    examples,
  }
}

function parseRule(rule: Messages.Rule): ParsedRule {
  const scenarios: ParsedScenario[] = []
  const scenarioOutlines: ParsedScenarioOutline[] = []
  let background: ParsedBackground | undefined

  for (const child of rule.children) {
    if (child.background) {
      background = parseBackground(child.background)
    } else if (child.scenario) {
      if (child.scenario.examples && child.scenario.examples.length > 0) {
        scenarioOutlines.push(parseScenarioOutline(child.scenario))
      } else {
        scenarios.push(parseScenario(child.scenario))
      }
    }
  }

  return {
    name: rule.name,
    description: rule.description || undefined,
    background,
    scenarios,
    scenarioOutlines,
  }
}

function parseGherkinDocument(
  document: Messages.GherkinDocument,
): ParsedFeature {
  const feature = document.feature
  if (!feature) {
    throw new Error('No feature found in document')
  }

  const scenarios: ParsedScenario[] = []
  const scenarioOutlines: ParsedScenarioOutline[] = []
  const rules: ParsedRule[] = []
  let background: ParsedBackground | undefined

  for (const child of feature.children) {
    if (child.background) {
      background = parseBackground(child.background)
    } else if (child.scenario) {
      if (child.scenario.examples && child.scenario.examples.length > 0) {
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
    description: feature.description || undefined,
    background,
    scenarios,
    scenarioOutlines,
    rules,
  }
}

export function parseFeatureFile(
  featurePath: string,
): Effect.Effect<ParsedFeature, FeatureParseError> {
  return Effect.try({
    try: () => {
      const resolvedPath = path.resolve(process.cwd(), featurePath)
      const content = fs.readFileSync(resolvedPath, 'utf-8')

      const uuidFn = Messages.IdGenerator.uuid()
      const builder = new Gherkin.AstBuilder(uuidFn)
      const matcher = new Gherkin.GherkinClassicTokenMatcher()
      const parser = new Gherkin.Parser(builder, matcher)

      const document = parser.parse(content)
      return parseGherkinDocument(document)
    },
    catch: (error) =>
      new FeatureParseError({
        path: featurePath,
        message: error instanceof Error ? error.message : String(error),
      }),
  })
}

export function parseFeatureFileSync(featurePath: string): ParsedFeature {
  const resolvedPath = path.resolve(process.cwd(), featurePath)
  const content = fs.readFileSync(resolvedPath, 'utf-8')

  const uuidFn = Messages.IdGenerator.uuid()
  const builder = new Gherkin.AstBuilder(uuidFn)
  const matcher = new Gherkin.GherkinClassicTokenMatcher()
  const parser = new Gherkin.Parser(builder, matcher)

  const document = parser.parse(content)
  return parseGherkinDocument(document)
}
