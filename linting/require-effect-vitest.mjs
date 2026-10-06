export const requireEffectVitestRule = {
  meta: {
    type: "problem",
    docs: { description: "Import test APIs from @effect/vitest instead of vitest." },
    schema: [],
    messages: {
      effectVitest: "Use @effect/vitest for test APIs and it.effect/it.live for Effectful tests.",
    },
  },
  create(context) {
    const check = (source) => {
      if (source?.type === "Literal" && source.value === "vitest") {
        context.report({ node: source, messageId: "effectVitest" })
      }
    }
    return {
      ImportDeclaration: (node) => check(node.source),
      ExportNamedDeclaration: (node) => check(node.source),
      ExportAllDeclaration: (node) => check(node.source),
      ImportExpression: (node) => check(node.source),
      CallExpression(node) {
        if (node.callee.type === "Identifier" && node.callee.name === "require") {
          check(node.arguments[0])
        }
      },
    }
  },
}
