/**
 * Custom ESLint rule to suggest Option.fromNullable instead of ternary with Option.some/none.
 * x !== null ? Option.some(x) : Option.none() should be Option.fromNullable(x)
 */
export const preferOptionFromNullableRule = {
  create(context) {
    return {
      ConditionalExpression(node) {
        const { test, consequent, alternate } = node

        // Check if test is: x !== null or x != null
        if (test.type !== "BinaryExpression") return
        if (test.operator !== "!==" && test.operator !== "!=") return

        let testedName = null
        if (
          test.left.type === "Identifier" &&
          test.right.type === "Literal" &&
          test.right.value === null
        ) {
          testedName = test.left.name
        } else if (
          test.right.type === "Identifier" &&
          test.left.type === "Literal" &&
          test.left.value === null
        ) {
          testedName = test.right.name
        } else if (
          test.left.type === "MemberExpression" &&
          test.right.type === "Literal" &&
          test.right.value === null
        ) {
          testedName = context.getSourceCode().getText(test.left)
        } else if (
          test.right.type === "MemberExpression" &&
          test.left.type === "Literal" &&
          test.left.value === null
        ) {
          testedName = context.getSourceCode().getText(test.right)
        }
        if (!testedName) return

        // Check if consequent is Option.some(x)
        if (consequent.type !== "CallExpression") return
        const conseqCallee = consequent.callee
        const isOptionSome =
          conseqCallee.type === "MemberExpression" &&
          conseqCallee.object.type === "Identifier" &&
          conseqCallee.object.name === "Option" &&
          conseqCallee.property.type === "Identifier" &&
          conseqCallee.property.name === "some"
        if (!isOptionSome) return

        // Check if alternate is Option.none()
        if (alternate.type !== "CallExpression") return
        const altCallee = alternate.callee
        // Handle both Option.none() and Option.none<Type>()
        const isOptionNone =
          (altCallee.type === "MemberExpression" &&
            altCallee.object.type === "Identifier" &&
            altCallee.object.name === "Option" &&
            altCallee.property.type === "Identifier" &&
            altCallee.property.name === "none") ||
          (altCallee.type === "TSInstantiationExpression" &&
            altCallee.expression.type === "MemberExpression" &&
            altCallee.expression.object.type === "Identifier" &&
            altCallee.expression.object.name === "Option" &&
            altCallee.expression.property.type === "Identifier" &&
            altCallee.expression.property.name === "none")
        if (!isOptionNone) return

        context.report({
          data: { name: testedName },
          messageId: "preferFromNullable",
          node,
        })
      },
    }
  },
  meta: {
    docs: {
      description: "Prefer Option.fromNullable over ternary with Option.some/none",
    },
    messages: {
      preferFromNullable:
        "Use Option.fromNullable({{name}}) instead of ternary with Option.some/Option.none.",
    },
    schema: [],
    type: "suggestion",
  },
}
