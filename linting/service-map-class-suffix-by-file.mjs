import path from "node:path"

const getMemberAccess = (expression) => {
  if (expression.type === "TSInstantiationExpression") {
    return getMemberAccess(expression.expression)
  }

  if (expression.type === "CallExpression") {
    return getMemberAccess(expression.callee)
  }

  if (
    expression.type === "MemberExpression" &&
    expression.object.type === "Identifier" &&
    expression.object.name === "ServiceMap" &&
    expression.property.type === "Identifier"
  ) {
    return expression.property.name
  }

  return null
}

/**
 * Enforce ServiceMap class names based on canonical file names:
 * - service.ts => *Service
 * - repository.ts => *Repository
 */
export const serviceMapClassSuffixByFileRule = {
  create(context) {
    const fileName = path.basename(context.filename ?? context.getFilename())

    return {
      ClassDeclaration(node) {
        if (!node.id || node.id.type !== "Identifier" || !node.superClass) return

        const memberAccess = getMemberAccess(node.superClass)
        if (memberAccess === null) return

        const className = node.id.name

        if (fileName === "service.ts" && memberAccess === "Service") {
          if (className.endsWith("Service") === false) {
            context.report({
              data: { name: className },
              messageId: "missingServiceSuffix",
              node: node.id,
            })
          }

          return
        }

        if (
          fileName === "repository.ts" &&
          (memberAccess === "Service" || memberAccess === "Repository")
        ) {
          if (className.endsWith("Repository") === false) {
            context.report({
              data: { name: className },
              messageId: "missingRepositorySuffix",
              node: node.id,
            })
          }
        }
      },
    }
  },
  meta: {
    docs: {
      description:
        "Require ServiceMap class names to match service.ts/repository.ts suffix conventions",
    },
    messages: {
      missingServiceSuffix:
        "Service classes must end with the 'Service' suffix. Rename '{{name}}' to '{{name}}Service' (applies to ServiceMap.Service classes declared in service.ts files).",
      missingRepositorySuffix:
        "Repository services must end with the 'Repository' suffix. Rename '{{name}}' to '{{name}}Repository' (applies to ServiceMap.Service/ServiceMap.Repository classes declared in repository.ts files).",
    },
    schema: [],
    type: "problem",
  },
}
