import { Array as Arr, Layer, Context } from "effect"
import { resolve } from "node:path"
import * as ts from "typescript/unstable/ast"
import type { CallExpression, Node, SourceFile } from "typescript/unstable/ast"
import { API } from "typescript/unstable/sync"

import type { StepKeyword } from "../../parser/types.js"
import type { DiscoveredStep, StepScope } from "../types.js"

export class StepDiscovery extends Context.Service<
  StepDiscovery,
  {
    discoverSteps: (files: Array<string>) => Array<DiscoveredStep>
  }
>()("StepDiscovery") {}

const STEP_KEYWORDS: Array<StepKeyword> = ["Given", "When", "Then", "And", "But"]

function extractStringLiteral(node: Node): string | null {
  if (ts.isStringLiteral(node)) {
    return node.text
  }
  return null
}

function isStepCallExpression(node: Node): node is CallExpression {
  if (!ts.isCallExpression(node)) {
    return false
  }

  const expression = node.expression

  if (ts.isIdentifier(expression)) {
    return STEP_KEYWORDS.includes(expression.text as StepKeyword)
  }

  return false
}

function getStepKeyword(node: CallExpression): StepKeyword | null {
  const expression = node.expression
  if (ts.isIdentifier(expression)) {
    const keyword = expression.text as StepKeyword
    if (STEP_KEYWORDS.includes(keyword)) {
      return keyword
    }
  }
  return null
}

function detectScope(node: Node): StepScope | undefined {
  if (!ts.isCallExpression(node)) return undefined
  const expression = node.expression
  if (!ts.isIdentifier(expression)) return undefined

  const name = expression.text
  if (name === "Background") {
    return { type: "background" }
  }
  if (name === "Scenario" && Arr.isReadonlyArrayNonEmpty(node.arguments)) {
    const scenarioName = extractStringLiteral(node.arguments[0])
    if (scenarioName !== null) {
      return { type: "scenario", name: scenarioName }
    }
  }
  if (name === "ScenarioOutline" && Arr.isReadonlyArrayNonEmpty(node.arguments)) {
    const outlineName = extractStringLiteral(node.arguments[0])
    if (outlineName !== null) {
      return { type: "scenario_outline", name: outlineName }
    }
  }
  return undefined
}

function visitNode(
  node: Node,
  sourceFile: SourceFile,
  filePath: string,
  currentScope: StepScope | undefined,
): Array<DiscoveredStep> {
  const steps: Array<DiscoveredStep> = []

  const detectedScope = detectScope(node)
  const scope = detectedScope ?? currentScope

  if (isStepCallExpression(node)) {
    const keyword = getStepKeyword(node)
    if (keyword && Arr.isReadonlyArrayNonEmpty(node.arguments)) {
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

  node.forEachChild((child) => {
    steps.push(...visitNode(child, sourceFile, filePath, scope))
  })

  return steps
}

function discoverStepsInFile(
  filePath: string,
  sourceFile: SourceFile | undefined,
): Array<DiscoveredStep> {
  if (!sourceFile) {
    return []
  }

  return visitNode(sourceFile, sourceFile, filePath, undefined)
}

export const StepDiscoveryLive = Layer.succeed(
  StepDiscovery,
  StepDiscovery.of({
    discoverSteps: (files) => {
      if (Arr.isReadonlyArrayEmpty(files)) {
        return []
      }

      const allSteps: Array<DiscoveredStep> = []
      const absoluteFiles = files.map((file) => resolve(file))
      const api = new API({ cwd: process.cwd() })

      try {
        const snapshot = api.updateSnapshot({ openFiles: absoluteFiles })

        try {
          for (const [index, file] of files.entries()) {
            const absoluteFile = absoluteFiles[index]
            const project = snapshot.getDefaultProjectForFile(absoluteFile)
            const sourceFile = project?.program.getSourceFile(absoluteFile)
            const steps = discoverStepsInFile(file, sourceFile)
            allSteps.push(...steps)
          }
        } finally {
          snapshot.dispose()
        }
      } finally {
        api.close()
      }

      return allSteps
    },
  }),
)
