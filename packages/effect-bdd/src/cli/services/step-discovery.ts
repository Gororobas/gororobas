import { Layer, ServiceMap } from "effect"
import * as ts from "typescript"

import type { StepKeyword } from "../../parser/types.js"
import type { DiscoveredStep, StepScope } from "../types.js"

export class StepDiscovery extends ServiceMap.Service<
  StepDiscovery,
  {
    discoverSteps: (files: Array<string>) => Array<DiscoveredStep>
  }
>()("StepDiscovery") {}

const STEP_KEYWORDS: Array<StepKeyword> = ["Given", "When", "Then", "And", "But"]

function createCompilerOptions(): ts.CompilerOptions {
  return {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    allowJs: true,
    allowSyntheticDefaultImports: true,
    esModuleInterop: true,
    skipLibCheck: true,
    noEmit: true,
  }
}

function extractStringLiteral(node: ts.Node): string | null {
  if (ts.isStringLiteral(node)) {
    return node.text
  }
  return null
}

function isStepCallExpression(node: ts.Node): node is ts.CallExpression {
  if (!ts.isCallExpression(node)) {
    return false
  }

  const expression = node.expression

  if (ts.isIdentifier(expression)) {
    return STEP_KEYWORDS.includes(expression.text as StepKeyword)
  }

  return false
}

function getStepKeyword(node: ts.CallExpression): StepKeyword | null {
  const expression = node.expression
  if (ts.isIdentifier(expression)) {
    const keyword = expression.text as StepKeyword
    if (STEP_KEYWORDS.includes(keyword)) {
      return keyword
    }
  }
  return null
}

function detectScope(node: ts.Node): StepScope | undefined {
  if (!ts.isCallExpression(node)) return undefined
  const expression = node.expression
  if (!ts.isIdentifier(expression)) return undefined

  const name = expression.text
  if (name === "Background") {
    return { type: "background" }
  }
  if (name === "Scenario" && node.arguments.length > 0) {
    const scenarioName = extractStringLiteral(node.arguments[0])
    if (scenarioName !== null) {
      return { type: "scenario", name: scenarioName }
    }
  }
  if (name === "ScenarioOutline" && node.arguments.length > 0) {
    const outlineName = extractStringLiteral(node.arguments[0])
    if (outlineName !== null) {
      return { type: "scenario_outline", name: outlineName }
    }
  }
  return undefined
}

function visitNode(
  node: ts.Node,
  sourceFile: ts.SourceFile,
  filePath: string,
  currentScope: StepScope | undefined,
): Array<DiscoveredStep> {
  const steps: Array<DiscoveredStep> = []

  const detectedScope = detectScope(node)
  const scope = detectedScope ?? currentScope

  if (isStepCallExpression(node)) {
    const keyword = getStepKeyword(node)
    if (keyword && node.arguments.length > 0) {
      const firstArg = node.arguments[0]
      const pattern = extractStringLiteral(firstArg)
      if (pattern !== null) {
        try {
          const position = node.getStart(sourceFile)
          const { line } = sourceFile.getLineAndCharacterOfPosition(position)
          steps.push({
            file: filePath,
            keyword,
            line: line + 1,
            pattern,
            scope,
          })
        } catch {
          steps.push({
            file: filePath,
            keyword,
            line: 0,
            pattern,
            scope,
          })
        }
      }
    }
  }

  ts.forEachChild(node, (child) => {
    steps.push(...visitNode(child, sourceFile, filePath, scope))
  })

  return steps
}

function discoverStepsInFile(filePath: string, program: ts.Program): Array<DiscoveredStep> {
  const sourceFile = program.getSourceFile(filePath)
  if (!sourceFile) {
    return []
  }

  return visitNode(sourceFile, sourceFile, filePath, undefined)
}

export const StepDiscoveryLive = Layer.succeed(
  StepDiscovery,
  StepDiscovery.of({
    discoverSteps: (files) => {
      if (files.length === 0) {
        return []
      }

      // Create a single program for all files to avoid per-file overhead
      const program = ts.createProgram(files, createCompilerOptions())
      const allSteps: Array<DiscoveredStep> = []

      for (const file of files) {
        const steps = discoverStepsInFile(file, program)
        allSteps.push(...steps)
      }

      return allSteps
    },
  }),
)
