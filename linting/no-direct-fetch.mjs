/**
 * Custom ESLint rule to ban direct fetch() usage.
 * Use Effect Platform or Effect RPC instead.
 * Direct fetch bypasses type safety, authentication handling, and error handling.
 */
export const noDirectFetchRule = {
  create(context) {
    return {
      CallExpression(node) {
        const callee = node.callee

        // Direct fetch() call
        if (callee.type === "Identifier" && callee.name === "fetch") {
          context.report({ messageId: "noDirectFetch", node })
          return
        }

        // window.fetch() or globalThis.fetch()
        if (
          callee.type === "MemberExpression" &&
          callee.property.type === "Identifier" &&
          callee.property.name === "fetch" &&
          callee.object.type === "Identifier" &&
          (callee.object.name === "window" || callee.object.name === "globalThis")
        ) {
          context.report({ messageId: "noDirectFetch", node })
          return
        }
      },
    }
  },
  meta: {
    docs: {
      description: "Disallow direct fetch() usage - use Effect Platform or Effect RPC instead",
    },
    messages: {
      noDirectFetch: "Do not use fetch() directly. Use Effect Platform or Effect RPC instead.",
    },
    schema: [],
    type: "problem",
  },
}
