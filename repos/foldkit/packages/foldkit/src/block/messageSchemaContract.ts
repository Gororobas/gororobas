import { Predicate, Schema, SchemaAST } from 'effect'

const gotMessagePattern = /^Got.+/

type RuntimeMessageSchemaContract = Readonly<{
  tags: ReadonlySet<string>
  gotWrapperTags: ReadonlySet<string>
}>

/** @internal Reads exact tagged Message variants without constructing values. */
export const runtimeMessageSchemaContract = (
  schema: Schema.Top,
): RuntimeMessageSchemaContract => {
  const tags = new Set<string>()
  const gotWrapperTags = new Set<string>()
  const visited = new Set<SchemaAST.AST>()

  const visit = (sourceAst: SchemaAST.AST): void => {
    const ast = SchemaAST.toType(sourceAst)
    if (visited.has(ast)) {
      return
    }
    visited.add(ast)

    if (SchemaAST.isSuspend(ast)) {
      visit(ast.thunk())
      return
    }
    if (SchemaAST.isUnion(ast)) {
      for (const member of ast.types) {
        visit(member)
      }
      return
    }
    if (!SchemaAST.isObjects(ast)) {
      return
    }

    const tagProperty = ast.propertySignatures.find(
      property => property.name === '_tag',
    )
    const tagAst =
      tagProperty === undefined ? undefined : SchemaAST.toType(tagProperty.type)
    if (
      tagAst === undefined ||
      !SchemaAST.isLiteral(tagAst) ||
      !Predicate.isString(tagAst.literal)
    ) {
      return
    }

    tags.add(tagAst.literal)
    if (
      gotMessagePattern.test(tagAst.literal) &&
      !ast.propertySignatures.some(
        property =>
          !SchemaAST.isOptional(property.type) &&
          SchemaAST.isNever(SchemaAST.toType(property.type)),
      )
    ) {
      gotWrapperTags.add(tagAst.literal)
    }
  }

  visit(schema.ast)
  return { tags, gotWrapperTags }
}
