const UUID_REGEX = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i

function isTestFile(filename) {
  if (!filename) return false
  return filename.includes("/test/") || filename.includes(".test.") || filename.includes("_test.")
}

export const noDirectIdConstructionRule = {
  create(context) {
    const filename = context.getFilename?.() || ""

    return {
      CallExpression(node) {
        if (isTestFile(filename) === true) return

        const callee = node.callee
        if (callee.type !== "MemberExpression") return
        if (
          callee.property.type !== "Identifier" ||
          (callee.property.name !== "makeUnsafe" && callee.property.name !== "makeOption")
        )
          return

        const obj = callee.object
        if (obj.type !== "Identifier") return

        if (obj.name.endsWith("Id") === true) {
          context.report({
            data: { idType: obj.name },
            messageId: "noDirectIdMake",
            node,
          })
        }
      },

      Literal(node) {
        if (isTestFile(filename) === true) return
        if (typeof node.value !== "string") return
        if (UUID_REGEX.test(node.value) === false) return

        context.report({
          messageId: "noHardcodedUuid",
          node,
        })
      },
    }
  },
  meta: {
    docs: {
      description: "Require IdGen.make() for ID generation instead of direct construction",
    },
    messages: {
      noDirectIdMake:
        "Do not use {{idType}}.makeUnsafe/makeOption() directly. Use yield* IdGen.make({{idType}}) to generate IDs through the IdGen service.",
      noHardcodedUuid:
        "Hardcoded UUID detected. Use yield* IdGen.make(XxxId) to generate IDs through the IdGen service.",
    },
    schema: [],
    type: "problem",
  },
}
