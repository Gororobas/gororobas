import { Array as EffectArray, Context, Layer, Option } from "effect"
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

function extractStringLiteral(node: Node): Option.Option<string> {
  if (ts.isStringLiteral(node)) {
    return Option.some(node.text)
  }
  return Option.none()
}

function isStepCallExpression(node: Node): node is CallExpression {
  if (!ts.isCallExpression(node)) {
    return false
  }

  const expression = node.expression

  if (ts.isIdentifier(expression)) {
    return Option.isSome(
      Option.fromNullishOr(STEP_KEYWORDS.find((keyword) => keyword === expression.text)),
    )
  }

  return false
}

function getStepKeyword(node: CallExpression): Option.Option<StepKeyword> {
  const expression = node.expression
  if (ts.isIdentifier(expression)) {
    return Option.fromNullishOr(STEP_KEYWORDS.find((keyword) => keyword === expression.text))
  }
  return Option.none()
}

function detectScope(node: Node): Option.Option<StepScope> {
  if (!ts.isCallExpression(node)) return Option.none()
  const expression = node.expression
  if (!ts.isIdentifier(expression)) return Option.none()

  const name = expression.text
  if (name === "Background") {
    return Option.some({ type: "background" })
  }
  if (name === "Scenario" && EffectArray.isReadonlyArrayNonEmpty(node.arguments)) {
    const scenarioName = extractStringLiteral(node.arguments[0])
    if (Option.isSome(scenarioName)) {
      return Option.some({ type: "scenario", name: scenarioName.value })
    }
  }
  if (name === "ScenarioOutline" && EffectArray.isReadonlyArrayNonEmpty(node.arguments)) {
    const outlineName = extractStringLiteral(node.arguments[0])
    if (Option.isSome(outlineName)) {
      return Option.some({ type: "scenario_outline", name: outlineName.value })
    }
  }
  return Option.none()
}

function visitNode(
  node: Node,
  sourceFile: SourceFile,
  filePath: string,
  currentScope: Option.Option<StepScope>,
): Array<DiscoveredStep> {
  const steps: Array<DiscoveredStep> = []

  const detectedScope = detectScope(node)
  const scope = Option.isSome(detectedScope) ? detectedScope : currentScope

  if (isStepCallExpression(node)) {
    const keyword = getStepKeyword(node)
    if (Option.isSome(keyword) && EffectArray.isReadonlyArrayNonEmpty(node.arguments)) {
      const firstArg = node.arguments[0]
      const pattern = extractStringLiteral(firstArg)
      if (Option.isSome(pattern)) {
        const position = node.getStart(sourceFile)
        const { line } = sourceFile.getLineAndCharacterOfPosition(position)
        steps.push({
          file: filePath,
          keyword: keyword.value,
          line: line + 1,
          pattern: pattern.value,
          ...Option.match(scope, { onNone: () => ({}), onSome: (value) => ({ scope: value }) }),
        })
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
  sourceFile: Option.Option<SourceFile>,
): Array<DiscoveredStep> {
  if (Option.isNone(sourceFile)) {
    return []
  }

  return visitNode(sourceFile.value, sourceFile.value, filePath, Option.none())
}

export const StepDiscoveryLive = Layer.succeed(
  StepDiscovery,
  StepDiscovery.of({
    discoverSteps: (files) => {
      if (EffectArray.isReadonlyArrayEmpty(files)) {
        return []
      }

      const allSteps: Array<DiscoveredStep> = []
      const absoluteFiles = files.map((file) =>
        file.startsWith("/") ? file : `${process.cwd()}/${file}`,
      )
      const api = new API({ cwd: process.cwd() })

      const snapshot = api.updateSnapshot({ openFiles: absoluteFiles })
      files.forEach((file, index) => {
        const absoluteFile = absoluteFiles[index]
        const project = snapshot.getDefaultProjectForFile(absoluteFile)
        const sourceFile = project?.program.getSourceFile(absoluteFile)
        allSteps.push(...discoverStepsInFile(file, Option.fromNullishOr(sourceFile)))
      })
      snapshot.dispose()
      api.close()

      return allSteps
    },
  }),
)
