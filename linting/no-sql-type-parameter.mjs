/**
 * Custom ESLint rule to ban sql<Type>`...` pattern.
 * Using type parameters with sql template literals provides no runtime validation.
 * Use SqlSchema.findOne/findAll/single/void with Schema for type-safe queries.
 */
export const noSqlTypeParameterRule = {
  create(context) {
    return {
      TaggedTemplateExpression(node) {
        const tag = node.tag
        // Check for sql<Type>`...` - typeArguments on TaggedTemplateExpression
        if (node.typeArguments || node.typeParameters) {
          // Check if tag is sql or ends with .sql
          const isSql =
            (tag.type === "Identifier" && tag.name === "sql") ||
            (tag.type === "MemberExpression" &&
              tag.property.type === "Identifier" &&
              tag.property.name === "sql")
          if (isSql) {
            context.report({
              messageId: "noSqlTypeParam",
              node,
            })
          }
        }
      },
    }
  },
  meta: {
    docs: {
      description: "Disallow type parameters on sql template literals",
    },
    messages: {
      noSqlTypeParam:
        "Do not use sql<Type>`...`. Type parameters provide no runtime validation. Use SqlSchema.findOne/findAll/single/void with a Schema for type-safe queries that validate at runtime.",
    },
    schema: [],
    type: "problem",
  },
}
