export const noFunctionAliasesRule = {
  meta: {
    type: "suggestion",
    docs: { description: "Use delegated functions directly." },
    schema: [],
    messages: { alias: "Remove {{name}}; call the delegated function directly." },
  },
  create(context) {
    const check = (node, name) => {
      // Type predicates narrow more precisely than the delegated function's signature.
      if (
        !name ||
        node.async ||
        node.generator ||
        node.params.length === 0 ||
        node.returnType?.typeAnnotation.type === "TSTypePredicate"
      ) {
        return
      }

      const statements = node.body.type === "BlockStatement" ? node.body.body : undefined

      const body = statements
        ? statements.length === 1 && statements[0].type === "ReturnStatement"
          ? statements[0].argument
          : undefined
        : node.body

      if (body?.type !== "CallExpression" || body.optional) return
      const callee = body.callee

      const root = (expression) =>
        expression.type === "MemberExpression"
          ? root(expression.object)
          : expression.type === "CallExpression"
            ? root(expression.callee)
            : expression

      const receiver = root(callee)

      if (
        receiver.type !== "Identifier" ||
        node.params.some((parameter) => parameter.name === receiver.name)
      ) {
        return
      }

      if (body.arguments.length !== node.params.length) return

      if (
        !body.arguments.every(
          (argument, index) =>
            argument.type === "Identifier" &&
            node.params[index].type === "Identifier" &&
            argument.name === node.params[index].name,
        )
      ) {
        return
      }

      if (
        receiver.name === name ||
        receiver.name === node.id?.name ||
        node.params.some((parameter) => parameter.name === receiver.name)
      ) {
        return
      }

      context.report({ node, messageId: "alias", data: { name } })
    }

    return {
      FunctionDeclaration(node) {
        check(node, node.id?.name)
      },
      VariableDeclarator(node) {
        if (
          node.id.type === "Identifier" &&
          (node.init?.type === "ArrowFunctionExpression" ||
            node.init?.type === "FunctionExpression")
        ) {
          check(node.init, node.id.name)
        }
      },
    }
  },
}

export const noManyFunctionParametersRule = {
  meta: {
    type: "suggestion",
    docs: { description: "Prefer an object to three or more positional parameters." },
    schema: [],
    messages: {
      parameters: "Prefer a single object parameter over three or more positional parameters.",
    },
  },
  create(context) {
    const check = (node) => {
      const name =
        node.id?.name ??
        (node.parent?.type === "VariableDeclarator" ? node.parent.id.name : undefined)
      const parent = node.parent
      const callee = parent?.type === "CallExpression" ? parent.callee : undefined

      const isView =
        callee?.type === "MemberExpression" &&
        !callee.computed &&
        callee.object.type === "Identifier" &&
        callee.object.name === "Submodel" &&
        callee.property.name === "defineView"

      if (node.params.length < 3 || name === "update" || isView) return
      context.report({ node, messageId: "parameters" })
    }

    return { FunctionDeclaration: check, FunctionExpression: check, ArrowFunctionExpression: check }
  },
}

export const noInlineImportsRule = {
  meta: {
    type: "suggestion",
    schema: [],
    messages: {
      inline: "Import this type at the top level instead of using an inline import type.",
    },
  },
  create(context) {
    return {
      TSImportType(node) {
        context.report({ node, messageId: "inline" })
      },
    }
  },
}

export const paddingAroundLargeStatementsRule = {
  meta: {
    type: "layout",
    fixable: "whitespace",
    docs: { description: "Separate statements spanning at least five lines with blank lines." },
    schema: [],
    messages: { padding: "Add a blank line between large statements and their neighbors." },
  },
  create(context) {
    const source = context.sourceCode

    const check = (node) => {
      for (let index = 1; index < node.body.length; index++) {
        const previous = node.body[index - 1]
        const current = node.body[index]

        if (
          [previous.type, current.type].some(
            (type) => type === "ImportDeclaration" || type === "EmptyStatement",
          )
        ) {
          continue
        }

        if (
          Math.max(
            previous.loc.end.line - previous.loc.start.line,
            current.loc.end.line - current.loc.start.line,
          ) < 4
        ) {
          continue
        }

        // Include attached comments when finding the separator.
        const comments = source.getCommentsBefore(current)
        const trailing = comments.filter(
          (comment) => comment.loc.start.line === previous.loc.end.line,
        )
        const boundary = trailing.at(-1) ?? previous
        const start = comments.find((comment) => comment.range[0] >= boundary.range[1]) ?? current
        const gap = source.text.slice(boundary.range[1], start.range[0])
        if (/\n\s*\n/u.test(gap) || !/^\s*$/u.test(gap)) continue

        context.report({
          node: current,
          messageId: "padding",
          fix(fixer) {
            return fixer.insertTextAfterRange(boundary.range, "\n")
          },
        })
      }
    }

    return {
      Program: check,
      BlockStatement: check,
      SwitchCase(node) {
        check({ body: node.consequent })
      },
    }
  },
}
