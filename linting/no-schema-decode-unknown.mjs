import * as P from "effect/Predicate"

function importedFromEffect(sourceCode, node) {
  const findVariable = (scope) =>
    scope?.set.get(node.name) ?? (scope?.upper && findVariable(scope.upper))
  const definition = findVariable(sourceCode.getScope(node))?.defs[0]
  if (definition?.type !== "ImportBinding") return
  const source = definition.parent.source.value
  if (source !== "effect" && source !== "effect/Schema") return
  return { source, specifier: definition.node }
}

function memberName(node) {
  if (!node.computed && node.property.type === "Identifier") return node.property.name
  if (node.computed && node.property.type === "Literal") return node.property.value
}

export const noSchemaDecodeUnknownRule = {
  meta: {
    type: "problem",
    docs: {
      description: "Prefer typed Schema decoders; explicitly exempt unknown input boundaries.",
    },
    schema: [],
    messages: {
      decodeUnknown:
        "Use Schema.decode* to preserve the input type. If the input must be unknown, add an oxlint-disable comment explaining the boundary.",
    },
  },
  create(context) {
    function isSchema(node) {
      if (node.type !== "Identifier") return false
      const binding = importedFromEffect(context.sourceCode, node)
      return (
        (binding?.source === "effect/Schema" && binding.specifier.type !== "ImportSpecifier") ||
        (binding?.source === "effect" && binding.specifier.imported?.name === "Schema")
      )
    }

    return {
      MemberExpression(node) {
        const name = memberName(node)
        if (!P.isString(name) || !name.startsWith("decodeUnknown")) return
        const object = node.object

        const namespaceBinding =
          object.type === "MemberExpression" &&
          memberName(object) === "Schema" &&
          object.object.type === "Identifier"
            ? importedFromEffect(context.sourceCode, object.object)
            : undefined

        if (
          isSchema(object) ||
          (namespaceBinding?.source === "effect" &&
            namespaceBinding.specifier.type === "ImportNamespaceSpecifier")
        ) {
          context.report({ node, messageId: "decodeUnknown" })
        }
      },
      ImportSpecifier(node) {
        const name = node.imported.name ?? node.imported.value
        if (node.parent.source.value === "effect/Schema" && name.startsWith("decodeUnknown")) {
          context.report({ node, messageId: "decodeUnknown" })
        }
      },
    }
  },
}
