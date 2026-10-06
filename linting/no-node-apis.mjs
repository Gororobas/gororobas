// Node's builtin inventory also includes bare and subpath specifiers.
// oxlint-disable-next-line custom-lint-rules/no-node-apis -- Plugin metadata requires the runtime's builtin inventory.
import { isBuiltin } from "node:module"

export const noNodeApisRule = {
  meta: {
    type: "problem",
    docs: { description: "Use Effect services instead of direct Node APIs." },
    schema: [],
    messages: {
      node: "Use Effect-native services instead of {{source}} (FileSystem, Path, HttpClient, HttpServer, ChildProcess, etc.).",
    },
  },
  create(context) {
    const check = (source) => {
      const value =
        source?.type === "TemplateLiteral" && source.expressions.length === 0
          ? source.quasis[0].value.cooked
          : source?.value
      if (typeof value !== "string" || !(value.startsWith("node:") || isBuiltin(value))) return
      context.report({ node: source, messageId: "node", data: { source: value } })
    }

    return {
      ImportDeclaration(node) {
        check(node.source)
      },
      ExportNamedDeclaration(node) {
        check(node.source)
      },
      ExportAllDeclaration(node) {
        check(node.source)
      },
      ImportExpression(node) {
        check(node.source)
      },
      CallExpression(node) {
        if (node.callee.type === "Identifier" && node.callee.name === "require") {
          check(node.arguments[0])
        }
      },
      TSImportType(node) {
        check(node.source)
      },
    }
  },
}
