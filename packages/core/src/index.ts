/** Algebraic styles for Effect and Foldkit.
 *
 *  - {@link Style}: declarations under conditions, an idempotent monoid compiled to atomic classes.
 *  - {@link When}: the conditions a declaration can hold under, with a total precedence order.
 *  - {@link Recipe}: Schema-typed variant families, every branch compiled ahead of time.
 *  - {@link Var}: typed custom properties for values that vary continuously with the Model.
 *  - {@link Token} and {@link Theme}: design tokens and the values that fill them.
 *  - {@link Global}: element rules, themes, font faces, and keyframes.
 *  - {@link Sheet}: the stylesheet, for server rendering and the browser.
 *  - {@link Calc} and {@link Color}: value helpers that compile to CSS functions.
 *
 *  @packageDocumentation */

export * as Calc from './calc.ts'
export * as Color from './color.ts'
export type { Declarations, Properties } from './declarations.ts'
export * as Global from './global.ts'
export * as Recipe from './recipe.ts'
export * as Sheet from './sheet.ts'
export * as Style from './style.ts'
export * as Theme from './theme.ts'
export * as Token from './token.ts'
export * as Var from './var.ts'
export * as When from './when.ts'
