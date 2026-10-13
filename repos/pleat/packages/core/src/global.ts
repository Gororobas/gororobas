import { type Declarations, renderBody } from './declarations.ts'
import { digest } from './hash.ts'
import { registerGlobal } from './sheet.ts'
import * as Theme from './theme.ts'
import * as When from './when.ts'

const SELECTOR = /^[^{};<>]+$/

const assertSelector = (selector: string): void => {
  if (!SELECTOR.test(selector) || selector.trim() === '') {
    throw new Error(
      `[pleat] ${JSON.stringify(selector)} is not a selector Pleat can write a rule for.`,
    )
  }
}

const wrapInAtRules = (condition: When.Condition, rule: string): string => {
  for (const atom of condition.atoms) {
    if (atom._tag !== 'AtRule') {
      throw new Error(
        '[pleat] Global rules take environment conditions only, such as When.dark. ' +
          'Put element states in the selector.',
      )
    }
  }
  return condition.atoms.reduceRight(
    (inner, atom) => (atom._tag === 'AtRule' ? `${atom.atRule}{${inner}}` : inner),
    rule,
  )
}

/** Adds a rule for elements Pleat doesn't render classes on, such as `body` or `a`, in the
 *  `pleat.globals` layer. Call it where the module loads, not in a view. */
export const rule = (
  selector: string,
  declarations: Declarations,
  options: Readonly<{ when?: When.Condition }> = {},
): void => {
  assertSelector(selector)
  const text = wrapInAtRules(
    options.when ?? When.always,
    `${selector}{${renderBody(declarations)}}`,
  )
  registerGlobal({ id: `rule:${digest(text)}`, layer: 'globals', rule: text })
}

const tokenValuesByScope = new Map<string, Map<string, string>>()

/** Applies a theme's token values at `selector` (default `:root`), optionally only under an
 *  environment condition, in the `pleat.themes` layer.
 *
 *  Themes applied at the same selector and condition merge into one rule, so independent
 *  token sets, such as primitives and semantics, can each be applied at `:root`. When two
 *  of them set the same token, the one applied later wins. Applying a theme again, in a
 *  browser too, updates the rule in place.
 *
 *  ```ts
 *  Global.theme(light)
 *  Global.theme(dark, { selector: '[data-theme="dark"]' })
 *  Global.theme(dark, { selector: ':root:not([data-theme])', when: When.dark })
 *  ``` */
export const theme = (
  value: Theme.Theme,
  options: Readonly<{ selector?: string; when?: When.Condition }> = {},
): void => {
  const selector = options.selector ?? ':root'
  assertSelector(selector)
  const condition = options.when ?? When.always
  const id = `theme:${selector}:${condition.key}`
  const tokenValues = new Map(tokenValuesByScope.get(id))
  for (const [name, tokenValue] of value.declarations) {
    tokenValues.set(name, tokenValue)
  }
  const merged: Theme.Theme = { ...value, declarations: [...tokenValues] }
  const text = wrapInAtRules(condition, Theme.css(merged, selector))
  tokenValuesByScope.set(id, tokenValues)
  registerGlobal({ id, layer: 'themes', rule: text })
}

/** Adds an `@font-face` rule. */
export const fontFace = (declarations: Declarations): void => {
  const text = `@font-face{${renderBody(declarations)}}`
  registerGlobal({ id: `font:${digest(text)}`, layer: 'globals', rule: text })
}

const KEYFRAME_SELECTOR =
  /^(from|to|\d{1,3}(\.\d+)?%)(\s*,\s*(from|to|\d{1,3}(\.\d+)?%))*$/
const KEYFRAMES_NAME = /^[a-z][a-z0-9-]*$/

/** Defines an `@keyframes` animation and returns its name, made unique by a hash of its
 *  frames. Use the name as an `animationName` value.
 *
 *  ```ts
 *  const fadeIn = Global.keyframes('fade-in', { from: { opacity: 0 }, to: { opacity: 1 } })
 *  const toast = Style.make({ animation: `${fadeIn} 160ms ease-out` })
 *  ``` */
export const keyframes = (
  name: string,
  frames: Readonly<Record<string, Declarations>>,
): string => {
  if (!KEYFRAMES_NAME.test(name)) {
    throw new Error(
      `[pleat] Keyframes name ${JSON.stringify(name)} must use lowercase letters, digits, and dashes.`,
    )
  }
  const body = Object.entries(frames)
    .map(([selector, declarations]) => {
      if (!KEYFRAME_SELECTOR.test(selector)) {
        throw new Error(
          `[pleat] ${JSON.stringify(selector)} is not a keyframe selector such as "from" or "50%".`,
        )
      }
      return `${selector}{${renderBody(declarations)}}`
    })
    .join('')
  const unique = `${name}-${digest(body)}`
  registerGlobal({
    id: `keyframes:${unique}`,
    layer: 'globals',
    rule: `@keyframes ${unique}{${body}}`,
  })
  return unique
}
