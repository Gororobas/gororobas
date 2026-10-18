import { Array as EffectArray, Context, HashMap, Layer, Option, Predicate, Record } from "effect"
import * as ts from "typescript/unstable/ast"
import type { Node, SourceFile } from "typescript/unstable/ast"
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

const UNKNOWN_VALUE = Symbol("Unknown static value")

type StaticValue =
  | typeof UNKNOWN_VALUE
  | string
  | boolean
  | StaticValue[]
  | { readonly [key: string]: StaticValue }
  | undefined

type Bindings = HashMap.HashMap<string, StaticValue>
type Helpers = Readonly<{ [name: string]: StepHelper }>
type StaticEnvironment = { bindings: Bindings; helpers: Helpers }
type StepHelper = ts.ArrowFunction | ts.FunctionExpression | ts.FunctionDeclaration

function evaluate(node: Node | undefined, { bindings, helpers }: StaticEnvironment): StaticValue {
  if (node === undefined) return undefined
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text
  if (node.kind === ts.SyntaxKind.TrueKeyword) return true
  if (node.kind === ts.SyntaxKind.FalseKeyword) return false

  if (ts.isIdentifier(node)) {
    return HashMap.has(bindings, node.text)
      ? Option.getOrUndefined(HashMap.get(bindings, node.text))
      : (STEP_KEYWORDS.find((keyword) => keyword === node.text) ??
          (Record.has(helpers, node.text)
            ? node.text
            : node.text === "undefined"
              ? undefined
              : UNKNOWN_VALUE))
  }

  if (ts.isParenthesizedExpression(node) || ts.isAsExpression(node)) {
    return evaluate(node.expression, { bindings, helpers })
  }

  if (ts.isArrayLiteralExpression(node)) {
    return node.elements.map((element) => evaluate(element, { bindings, helpers }))
  }

  if (ts.isConditionalExpression(node)) {
    const condition = evaluate(node.condition, { bindings, helpers })

    return Predicate.isBoolean(condition)
      ? evaluate(condition ? node.whenTrue : node.whenFalse, {
          bindings,
          helpers,
        })
      : UNKNOWN_VALUE
  }

  if (ts.isObjectLiteralExpression(node)) {
    const value: { [key: string]: StaticValue } = {}

    node.properties.forEach((property) => {
      if (ts.isPropertyAssignment(property)) {
        const name = property.name

        if (ts.isIdentifier(name)) {
          value[name.text] = evaluate(property.initializer, {
            bindings,
            helpers,
          })
        }
      } else if (ts.isShorthandPropertyAssignment(property)) {
        const name = property.name
        if (ts.isIdentifier(name)) {
          value[name.text] = evaluate(name, { bindings, helpers })
        }
      }
    })

    return value
  }

  return UNKNOWN_VALUE
}

function bindParameter({
  name,
  value,
  bindings,
  helpers,
}: StaticEnvironment & {
  name: ts.BindingName
  value: StaticValue
}): Bindings {
  if (ts.isIdentifier(name)) return HashMap.set(bindings, name.text, value)

  if (ts.isArrayBindingPattern(name) && Array.isArray(value)) {
    let current = bindings

    name.elements.forEach((element, index) => {
      if (ts.isBindingElement(element) && element.name !== undefined) {
        current = bindParameter({
          name: element.name,
          value: value[index],
          bindings: current,
          helpers,
        })
      }
    })

    return current
  }

  if (ts.isObjectBindingPattern(name)) {
    return name.elements.reduce((current, element) => {
      const elementName = element.name
      const key = element.propertyName ?? elementName
      if (key === undefined || elementName === undefined || !ts.isIdentifier(key)) return current

      const supplied =
        value === UNKNOWN_VALUE
          ? UNKNOWN_VALUE
          : Predicate.isObject(value) && !Array.isArray(value) && Record.has(value, key.text)
            ? value[key.text]
            : undefined

      return bindParameter({
        name: elementName,
        value:
          supplied === undefined
            ? evaluate(element.initializer, { bindings: current, helpers })
            : supplied,
        bindings: current,
        helpers,
      })
    }, bindings)
  }

  return bindings
}

function detectScope(
  node: Node,
  { bindings, helpers }: StaticEnvironment,
): Option.Option<StepScope> {
  if (!ts.isCallExpression(node)) return Option.none()
  const expression = node.expression
  if (!ts.isIdentifier(expression)) return Option.none()

  const name = expression.text
  if (name === "Background") {
    return Option.some({ type: "background" })
  }

  if (name === "Scenario" && EffectArray.isReadonlyArrayNonEmpty(node.arguments)) {
    const scenarioName = Option.fromNullishOr(evaluate(node.arguments[0], { bindings, helpers }))
    if (Option.isSome(scenarioName) && Predicate.isString(scenarioName.value)) {
      return Option.some({ type: "scenario", name: scenarioName.value })
    }
  }

  if (name === "ScenarioOutline" && EffectArray.isReadonlyArrayNonEmpty(node.arguments)) {
    const outlineName = Option.fromNullishOr(evaluate(node.arguments[0], { bindings, helpers }))
    if (Option.isSome(outlineName) && Predicate.isString(outlineName.value)) {
      return Option.some({ type: "scenario_outline", name: outlineName.value })
    }
  }

  return Option.none()
}

function visitNode({
  node,
  sourceFile,
  filePath,
  currentScope,
  bindings,
  helpers,
  activeHelpers = [],
}: {
  node: Node
  sourceFile: SourceFile
  filePath: string
  currentScope: Option.Option<StepScope>
  bindings: Bindings
  helpers: Helpers
  activeHelpers?: readonly StepHelper[]
}): Array<DiscoveredStep> {
  const steps: Array<DiscoveredStep> = []

  if (ts.isSourceFile(node) || ts.isBlock(node)) {
    let localHelpers = helpers
    let localBindings = bindings

    node.statements.forEach((statement) => {
      if (ts.isFunctionDeclaration(statement) && statement.name !== undefined) {
        localHelpers = { ...localHelpers, [statement.name.text]: statement }
      } else if (ts.isVariableStatement(statement)) {
        statement.declarationList.declarations.forEach((declaration) => {
          if (!ts.isIdentifier(declaration.name)) return
          const initializer = declaration.initializer

          if (
            initializer &&
            (ts.isArrowFunction(initializer) || ts.isFunctionExpression(initializer))
          ) {
            localHelpers = { ...localHelpers, [declaration.name.text]: initializer }
          } else {
            localBindings = HashMap.set(
              localBindings,
              declaration.name.text,
              evaluate(initializer, { bindings: localBindings, helpers: localHelpers }),
            )
          }
        })
      }
    })

    bindings = localBindings
    helpers = localHelpers
  }

  // A helper defines steps only when called; expansion inherits the caller's scenario scope.
  if (
    (ts.isArrowFunction(node) || ts.isFunctionExpression(node) || ts.isFunctionDeclaration(node)) &&
    Record.values(helpers).includes(node) &&
    !activeHelpers.includes(node)
  ) {
    return steps
  }

  const detectedScope = detectScope(node, { bindings, helpers })
  const scope = Option.isSome(detectedScope) ? detectedScope : currentScope

  if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
    const keywordValue = evaluate(node.expression, { bindings, helpers })
    const keyword = STEP_KEYWORDS.find((candidate) => candidate === keywordValue)
    const pattern = evaluate(node.arguments[0], { bindings, helpers })

    if (keyword !== undefined && Predicate.isString(pattern)) {
      const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile))

      steps.push({
        file: filePath,
        keyword,
        line: line + 1,
        pattern,
        ...Option.match(scope, { onNone: () => ({}), onSome: (value) => ({ scope: value }) }),
      })
    }

    const helper = helpers[Predicate.isString(keywordValue) ? keywordValue : node.expression.text]

    if (helper?.body !== undefined && !activeHelpers.includes(helper)) {
      let argumentsBindings = bindings

      helper.parameters.forEach((parameter, index) => {
        const supplied = evaluate(node.arguments[index], { bindings, helpers })

        argumentsBindings = bindParameter({
          name: parameter.name,
          value:
            supplied === undefined
              ? evaluate(parameter.initializer, { bindings: argumentsBindings, helpers })
              : supplied,
          bindings: argumentsBindings,
          helpers,
        })
      })

      steps.push(
        ...visitNode({
          node: helper.body,
          sourceFile,
          filePath,
          currentScope: scope,
          bindings: argumentsBindings,
          helpers,
          activeHelpers: [...activeHelpers, helper],
        }),
      )
    }
  }

  if (ts.isPropertyAssignment(node)) {
    const name = node.name

    if (ts.isIdentifier(name) && name.text === "steps" && ts.isIdentifier(node.initializer)) {
      const helper = helpers[node.initializer.text]

      if (helper?.body !== undefined && !activeHelpers.includes(helper)) {
        steps.push(
          ...visitNode({
            node: helper.body,
            sourceFile,
            filePath,
            currentScope: scope,
            bindings,
            helpers,
            activeHelpers: [...activeHelpers, helper],
          }),
        )
      }
    }
  }

  if (
    ts.isCallExpression(node) &&
    ts.isPropertyAccessExpression(node.expression) &&
    node.expression.name.text === "forEach"
  ) {
    const values = evaluate(node.expression.expression, { bindings, helpers })
    const callback = node.arguments[0]

    if (
      Array.isArray(values) &&
      callback !== undefined &&
      (ts.isArrowFunction(callback) || ts.isFunctionExpression(callback))
    ) {
      values.forEach((value) => {
        const parameter = callback.parameters[0]
        const iterationBindings =
          parameter === undefined
            ? bindings
            : bindParameter({ name: parameter.name, value, bindings, helpers })

        steps.push(
          ...visitNode({
            node: callback.body,
            sourceFile,
            filePath,
            currentScope: scope,
            bindings: iterationBindings,
            helpers,
            activeHelpers,
          }),
        )
      })

      return steps
    }
  }

  node.forEachChild((child) => {
    steps.push(
      ...visitNode({
        node: child,
        sourceFile: sourceFile,
        filePath: filePath,
        currentScope: scope,
        bindings,
        helpers,
        activeHelpers,
      }),
    )
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

  return visitNode({
    node: sourceFile.value,
    sourceFile: sourceFile.value,
    filePath: filePath,
    currentScope: Option.none(),
    bindings: HashMap.empty(),
    helpers: {},
  })
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
