import { parse } from "@babel/parser"
import { readFileSync, readdirSync } from "node:fs"
import { dirname, resolve, relative } from "node:path"

const memberName = (node) =>
  node?.type === "MemberExpression" && !node.computed ? node.property.name : undefined
const rule = (description, create) => ({
  meta: { type: "problem", schema: [], docs: { description } },
  create,
})
const report = (context, node, message) => context.report({ node, message })
const children = (node) =>
  Object.entries(node).flatMap(([key, value]) => {
    if (["parent", "loc", "range", "tokens", "comments"].includes(key)) return []
    if (Array.isArray(value)) return value.filter((child) => child?.type)
    return value?.type ? [value] : []
  })
const contains = (node, predicate) =>
  predicate(node) || children(node).some((child) => contains(child, predicate))

export const moduleImportBoundaries = rule(
  "Keep feature implementation details behind services.",
  (context) => ({
    ImportDeclaration(node) {
      const filename = context.filename.replaceAll("\\", "/")
      const source = node.source.value
      if (
        filename.includes("/packages/domain/") &&
        (source === "@gororobas/server" ||
          source.startsWith("@gororobas/server/") ||
          source.startsWith("@effect/platform-node") ||
          source.startsWith("node:") ||
          /\/apps\/server\//.test(resolve(dirname(filename), source)))
      ) {
        report(context, node, "Domain modules must not depend on server modules.")
      }
      const feature = filename.match(/\/apps\/server\/src\/([^/]+)\//)?.[1]
      if (
        feature &&
        (source.startsWith(".") || source.startsWith("@gororobas/server/")) &&
        /\/(queries|mutations)(?:\.[jt]s)?$/.test(source)
      ) {
        const target = (
          source.startsWith("@gororobas/server/")
            ? resolve("apps/server/src", source.slice("@gororobas/server/".length))
            : resolve(dirname(filename), source)
        )
          .replaceAll("\\", "/")
          .match(/\/apps\/server\/src\/([^/]+)\//)?.[1]
        if (target && target !== feature) {
          report(
            context,
            node,
            "Import the other feature's service instead of its queries or mutations.",
          )
        }
      }
    },
  }),
)

export const noStringifiedErrors = rule("Keep errors structured in messages.", (context) => ({
  CallExpression(node) {
    const message =
      node.callee.type === "Identifier"
        ? node.callee.name
        : (node.callee.object?.name ?? memberName(node.callee))
    if (!/Message|Msg/.test(message ?? "")) return
    for (const argument of node.arguments) {
      if (
        contains(
          argument,
          (child) =>
            (child.type === "CallExpression" &&
              child.callee.type === "Identifier" &&
              child.callee.name === "String" &&
              child.arguments.some(
                (value) => value.type === "Identifier" && /error|cause/i.test(value.name),
              )) ||
            (child.type === "TemplateLiteral" &&
              child.expressions.some(
                (value) => value.type === "Identifier" && /error|cause/i.test(value.name),
              )),
        )
      ) {
        report(
          context,
          argument,
          "Pass a structured error to the Message instead of stringifying it.",
        )
      }
    }
  },
}))

export const noLiteralStylesOutsideTheme = rule(
  "Define literal style values in the theme.",
  (context) => {
    if (context.filename.includes("/ui/theme/")) return {}
    return {
      CallExpression(node) {
        if (
          node.callee.type !== "MemberExpression" ||
          node.callee.object.type !== "Identifier" ||
          node.callee.object.name !== "Style" ||
          memberName(node.callee) !== "make"
        ) {
          return
        }
        for (const argument of node.arguments) {
          if (
            contains(
              argument,
              (child) =>
                (child.type === "Literal" &&
                  typeof child.value === "string" &&
                  /#[\da-f]{3,8}\b|\brgba?\(|\b\d*\.?\d+px\b/i.test(child.value)) ||
                (child.type === "TemplateElement" &&
                  /#[\da-f]{3,8}\b|\brgba?\(|\b\d*\.?\d+px\b/i.test(child.value.raw)),
            )
          ) {
            report(
              context,
              argument,
              "Use theme tokens instead of literal colors or pixel lengths in Style.make.",
            )
          }
        }
      },
    }
  },
)

let exportedConstants
export const collectConstants = (directories = ["apps", "packages"]) => {
  const declarations = new Map()
  const walk = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (["node_modules", "dist", "build", "repos", "coverage"].includes(entry.name)) continue
      const filename = resolve(directory, entry.name)
      if (entry.isDirectory()) {
        walk(filename)
        continue
      }
      if (!/\.tsx?$/.test(entry.name) || entry.name.endsWith(".d.ts")) continue
      const tree = parse(readFileSync(filename, "utf8"), {
        sourceType: "module",
        plugins: ["typescript", ...(entry.name.endsWith(".tsx") ? ["jsx"] : [])],
      })
      for (const statement of tree.program.body) {
        if (
          statement.type !== "ExportNamedDeclaration" ||
          statement.declaration?.type !== "VariableDeclaration"
        ) {
          continue
        }
        for (const declaration of statement.declaration.declarations) {
          if (
            declaration.id.type !== "Identifier" ||
            !/^[A-Z][A-Z_\d]*$/.test(declaration.id.name)
          ) {
            continue
          }
          const files = declarations.get(declaration.id.name) ?? []
          files.push(filename)
          declarations.set(declaration.id.name, files)
        }
      }
    }
  }
  for (const directory of directories) walk(directory)
  return declarations
}
export const noDuplicateConstants = rule(
  "Give exported constants one canonical declaration.",
  (context) => ({
    ExportNamedDeclaration(node) {
      if (node.declaration?.type !== "VariableDeclaration") return
      for (const declaration of node.declaration.declarations) {
        if (declaration.id.type !== "Identifier" || !/^[A-Z][A-Z_\d]*$/.test(declaration.id.name)) {
          continue
        }
        exportedConstants ??= collectConstants()
        const others = (exportedConstants.get(declaration.id.name) ?? []).filter(
          (file) => file !== resolve(context.filename),
        )
        if (others.length) {
          report(
            context,
            declaration,
            `Export ${declaration.id.name} from one module; also declared in ${others.map((file) => relative(process.cwd(), file)).join(", ")}.`,
          )
        }
      }
    },
  }),
)
