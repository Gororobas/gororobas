import { propertyPriority } from './property.ts'
import * as When from './when.ts'

// ATOMS

/** One declaration under one condition, compiled to one class and at most one rule.
 *  A marker atom contributes a class and no rule. */
export interface Atom {
  readonly _tag: 'Declaration' | 'Marker'
  /** Canonical identity: the condition, property, and value. */
  readonly key: string
  readonly condition: When.Condition
  /** camelCase or `--custom`. Empty for markers. */
  readonly property: string
  readonly value: string
  readonly className: string
  /** Atoms in one slot replace each other: `${condition.key}|${property}`. */
  readonly slot: string
  readonly priority: number
  /** The rule text. Empty for markers. */
  readonly rule: string
}

/** Orders atoms the way the stylesheet emits them: by condition precedence, then by
 *  property priority so a longhand beats its shorthand under the same condition. */
export const compareAtoms = (left: Atom, right: Atom): number => {
  const byCondition = When.compare(left.condition, right.condition)
  if (byCondition !== 0) {
    return byCondition
  }
  if (left.priority !== right.priority) {
    return left.priority - right.priority
  }
  return left.className < right.className ? -1 : left.className > right.className ? 1 : 0
}

// REGISTRY

const atomsByClassName = new Map<string, Atom>()
const globalsById = new Map<string, Global>()
let version = 0

/** A rule outside the atomic layer: a theme, a keyframes block, a font face, an element rule. */
export interface Global {
  readonly id: string
  readonly layer: 'globals' | 'themes'
  readonly rule: string
}

/** @internal Registers an atom, returning the canonical instance for its class. */
export const registerAtom = (atom: Atom): Atom => {
  const existing = atomsByClassName.get(atom.className)
  if (existing !== undefined) {
    if (existing.key !== atom.key) {
      throw new Error(
        `[pleat] Class ${atom.className} was computed for two different declarations, ` +
          `${JSON.stringify(existing.key)} and ${JSON.stringify(atom.key)}. ` +
          'This is a hash collision; please report it.',
      )
    }
    return existing
  }
  atomsByClassName.set(atom.className, atom)
  version += 1
  if (mounted?.pendingClassNames.has(atom.className) === true) {
    adoptPending(mounted, atom)
  }
  return atom
}

/** @internal Builds a declaration atom. */
export const makeAtom = (
  condition: When.Condition,
  property: string,
  value: string,
  className: string,
  body: string,
): Atom => ({
  _tag: 'Declaration',
  key: `${condition.key}{${property}:${value}}`,
  condition,
  property,
  value,
  className,
  slot: `${condition.key}|${property}`,
  priority: propertyPriority(property),
  rule: When.renderRule(condition, className, body),
})

/** @internal Registers a global rule. Registering the same id again replaces its text, in
 *  the same position, in the browser too. */
export const registerGlobal = (global: Global): void => {
  const existing = globalsById.get(global.id)
  if (existing !== undefined && existing.rule === global.rule) {
    return
  }
  globalsById.set(global.id, global)
  version += 1
  if (mounted !== undefined) {
    insertGlobal(mounted, global)
  }
}

// RENDERING

// NOTE: cascade layers are ordered by where the page first declares them, so this goes
// before any other CSS. Tailwind v4's theme, base (its preflight reset), and components
// layers come first, then Pleat, then Tailwind's utilities: a utility beats a Pleat atom,
// and Pleat's globals and atoms beat the reset. Unlayered CSS beats them all.
const LAYER_ORDER =
  '@layer theme, base, components, pleat, utilities;\n' +
  '@layer pleat.globals, pleat.themes, pleat.atoms;'

let sortedCache: Readonly<{ version: number; atoms: ReadonlyArray<Atom> }> = {
  version: -1,
  atoms: [],
}

const sortedAtoms = (): ReadonlyArray<Atom> => {
  if (sortedCache.version !== version) {
    sortedCache = {
      version,
      atoms: [...atomsByClassName.values()]
        .filter(atom => atom._tag === 'Declaration')
        .sort(compareAtoms),
    }
  }
  return sortedCache.atoms
}

const globalsIn = (layer: Global['layer']): string =>
  [...globalsById.values()]
    .filter(global => global.layer === layer)
    .map(global => global.rule)
    .join('')

/** Options for {@link render}. */
export type RenderOptions = Readonly<{
  /** Only emit atoms for these classes. Globals and themes are always emitted. */
  classNames?: Iterable<string>
}>

/** The stylesheet for every style, theme, and global rule defined so far.
 *
 *  Rules live in three cascade layers, `pleat.globals`, `pleat.themes`, and `pleat.atoms`.
 *  The sheet opens by declaring the page's layer order,
 *  `@layer theme, base, components, pleat, utilities`, which puts Pleat after Tailwind v4's
 *  theme, preflight reset, and components, and before its utilities. Unlayered CSS (an
 *  app's own stylesheet) wins over Pleat. Layers are ordered by where the page first
 *  declares them, so this sheet must come before any other stylesheet. */
export const render = (options: RenderOptions = {}): string => {
  const included =
    options.classNames === undefined ? undefined : new Set(options.classNames)
  const atoms = sortedAtoms()
    .filter(atom => included === undefined || included.has(atom.className))
    .map(atom => atom.rule)
    .join('')
  return [
    LAYER_ORDER,
    `@layer pleat.globals{${globalsIn('globals')}}`,
    `@layer pleat.themes{${globalsIn('themes')}}`,
    `@layer pleat.atoms{${atoms}}`,
  ].join('\n')
}

const CLASS_ATTRIBUTE = /\sclass\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/gi

/** The class names used in an HTML string. */
export const classNamesIn = (html: string): ReadonlySet<string> => {
  const classNames = new Set<string>()
  for (const match of html.matchAll(CLASS_ATTRIBUTE)) {
    const value = match[1] ?? match[2] ?? match[3] ?? ''
    for (const className of value.split(/\s+/)) {
      if (className !== '') {
        classNames.add(className)
      }
    }
  }
  return classNames
}

/** The stylesheet a server-rendered page needs: every global and theme rule, plus the atoms
 *  whose classes appear in `html`. */
export const renderFor = (html: string): string =>
  render({ classNames: classNamesIn(html) })

/** The attribute that marks Pleat's server-rendered `<style>` element. */
export const STYLE_ATTRIBUTE = 'data-pleat'

const escapeStyleText = (css: string): string => css.replace(/<\//g, '<\\/')

/** A `<style data-pleat>` element for a document head. Pass `html` to include only the atoms
 *  that page uses. Put it before every other stylesheet, so its layer order comes first; see
 *  {@link render}. */
export const styleTag = (html?: string): string =>
  `<style ${STYLE_ATTRIBUTE}>${escapeStyleText(html === undefined ? render() : renderFor(html))}</style>`

/** Every atom defined so far, in emission order. */
export const atoms = (): ReadonlyArray<Atom> => sortedAtoms()

// BROWSER

type Mounted = Readonly<{
  globals: CSSGroupingRule
  themes: CSSGroupingRule
  atoms: CSSGroupingRule
  /** The class of each rule in `atoms`, in sheet order. */
  ruleClassNames: Array<string>
  /** The atoms in `atoms` this page has defined, sorted. Every rule is one of these, or a
   *  rule the server sent for a class this page hasn't defined yet. */
  insertedAtoms: Array<Atom>
  /** Every class with a rule in `atoms`, including the server's. */
  insertedClassNames: Set<string>
  /** Classes the server sent rules for that this page hasn't defined yet, such as those of
   *  a module that loads later. */
  pendingClassNames: Set<string>
  /** The browser's rule for each global id, to replace when the global changes. */
  insertedGlobals: Map<string, CSSRule>
}>

let mounted: Mounted | undefined

const hasDocument = (): boolean =>
  typeof document !== 'undefined' && typeof CSSStyleSheet !== 'undefined'

type LayerBlocks = Readonly<{
  globals: CSSGroupingRule
  themes: CSSGroupingRule
  atoms: CSSGroupingRule
}>

const layerBlock = (sheet: CSSStyleSheet, name: string): CSSGroupingRule | undefined => {
  for (const rule of sheet.cssRules) {
    if (rule instanceof CSSGroupingRule && 'name' in rule && rule.name === name) {
      return rule
    }
  }
  return undefined
}

const layerBlocks = (sheet: CSSStyleSheet): LayerBlocks | undefined => {
  const globals = layerBlock(sheet, 'pleat.globals')
  const themes = layerBlock(sheet, 'pleat.themes')
  const atoms = layerBlock(sheet, 'pleat.atoms')
  return globals === undefined || themes === undefined || atoms === undefined
    ? undefined
    : { globals, themes, atoms }
}

const createSheet = (target: Document): LayerBlocks => {
  const shell = `${LAYER_ORDER}@layer pleat.globals{}@layer pleat.themes{}@layer pleat.atoms{}`
  let sheet: CSSStyleSheet | null
  if ('adoptedStyleSheets' in target && 'replaceSync' in CSSStyleSheet.prototype) {
    sheet = new CSSStyleSheet()
    sheet.replaceSync(shell)
    target.adoptedStyleSheets = [...target.adoptedStyleSheets, sheet]
  } else {
    const element = target.createElement('style')
    element.setAttribute(`${STYLE_ATTRIBUTE}-client`, '')
    element.textContent = shell
    target.head.append(element)
    sheet = element.sheet
  }
  const blocks = sheet === null ? undefined : layerBlocks(sheet)
  if (blocks === undefined) {
    throw new Error('[pleat] Could not create a stylesheet with cascade layers.')
  }
  return blocks
}

const LAYERS_ATTRIBUTE = `${STYLE_ATTRIBUTE}-layers`

/** Makes Pleat's layer order the first the page declares, even when another stylesheet,
 *  such as Tailwind's, came before Pleat's. Returns whether it had to add one. */
const declareLayersFirst = (target: Document): boolean => {
  const first = target.querySelector('style, link[rel~="stylesheet" i]')
  if (first?.hasAttribute(STYLE_ATTRIBUTE) === true) {
    return false
  }
  const element = target.createElement('style')
  element.setAttribute(LAYERS_ATTRIBUTE, '')
  element.textContent = LAYER_ORDER
  target.head.prepend(element)
  return true
}

// NOTE: Chromium doesn't reorder layers when a stylesheet is added ahead of the others,
// only when an existing one changes, so changing Pleat's own sheet makes it notice.
const refreshLayerOrder = (block: CSSGroupingRule): void => {
  const sheet = block.parentStyleSheet
  if (sheet !== null) {
    sheet.insertRule('@layer pleat;', sheet.cssRules.length)
    sheet.deleteRule(sheet.cssRules.length - 1)
  }
}

const serverSheet = (target: Document): LayerBlocks | undefined => {
  const element = target.querySelector(`style[${STYLE_ATTRIBUTE}]`)
  const sheet = element instanceof HTMLStyleElement ? element.sheet : null
  return sheet === null ? undefined : layerBlocks(sheet)
}

const CLASS_SELECTOR = /^\.([\w-]+)/

/** The class an atom rule applies to: the first class of its innermost style rule. */
const classOfRule = (rule: CSSRule): string => {
  if (rule instanceof CSSStyleRule) {
    return CLASS_SELECTOR.exec(rule.selectorText)?.[1] ?? ''
  }
  if (rule instanceof CSSGroupingRule) {
    const inner = rule.cssRules.item(0)
    return inner === null ? '' : classOfRule(inner)
  }
  return ''
}

const indexOfRule = (block: CSSGroupingRule, rule: CSSRule): number =>
  Array.prototype.indexOf.call(block.cssRules, rule)

const insertGlobal = (target: Mounted, global: Global): void => {
  const block = global.layer === 'globals' ? target.globals : target.themes
  const existing = target.insertedGlobals.get(global.id)
  const existingIndex = existing === undefined ? -1 : indexOfRule(block, existing)
  // NOTE: the new rule goes in before the old one comes out, so a rule the browser rejects
  // leaves the old one in place.
  const index = block.insertRule(
    global.rule,
    existingIndex >= 0 ? existingIndex : block.cssRules.length,
  )
  if (existingIndex >= 0) {
    block.deleteRule(existingIndex + 1)
  }
  const inserted = block.cssRules.item(index)
  if (inserted !== null) {
    target.insertedGlobals.set(global.id, inserted)
  }
}

/** Where `atom` goes among the sorted atoms. */
const sortedIndex = (atoms: ReadonlyArray<Atom>, atom: Atom): number => {
  let low = 0
  let high = atoms.length
  while (low < high) {
    const middle = (low + high) >>> 1
    const candidate = atoms[middle]
    if (candidate !== undefined && compareAtoms(candidate, atom) < 0) {
      low = middle + 1
    } else {
      high = middle
    }
  }
  return low
}

/** The sheet index of the rule for `insertedAtoms[index]`, or the end of the sheet. */
const ruleIndex = (target: Mounted, index: number): number => {
  const atom = target.insertedAtoms[index]
  if (atom === undefined) {
    return target.ruleClassNames.length
  }
  // NOTE: with no pending server rules, the sheet holds exactly the sorted atoms.
  return target.ruleClassNames.length === target.insertedAtoms.length
    ? index
    : target.ruleClassNames.indexOf(atom.className)
}

const insertAtom = (target: Mounted, atom: Atom): void => {
  if (atom._tag === 'Marker' || target.insertedClassNames.has(atom.className)) {
    return
  }
  const index = sortedIndex(target.insertedAtoms, atom)
  const at = ruleIndex(target, index)
  target.atoms.insertRule(atom.rule, at)
  target.ruleClassNames.splice(at, 0, atom.className)
  target.insertedAtoms.splice(index, 0, atom)
  target.insertedClassNames.add(atom.className)
}

/** Takes in a server rule whose atom this page has just defined, moving the rule if atoms
 *  inserted since mounting put it out of order. */
const adoptPending = (target: Mounted, atom: Atom): void => {
  target.pendingClassNames.delete(atom.className)
  const at = target.ruleClassNames.indexOf(atom.className)
  const index = sortedIndex(target.insertedAtoms, atom)
  const before = target.insertedAtoms[index - 1]
  const after = target.insertedAtoms[index]
  const isInOrder =
    (before === undefined || target.ruleClassNames.indexOf(before.className) < at) &&
    (after === undefined || target.ruleClassNames.indexOf(after.className) > at)
  if (!isInOrder) {
    target.atoms.deleteRule(at)
    target.ruleClassNames.splice(at, 1)
    const moved =
      after === undefined
        ? target.ruleClassNames.length
        : target.ruleClassNames.indexOf(after.className)
    target.atoms.insertRule(atom.rule, moved)
    target.ruleClassNames.splice(moved, 0, atom.className)
  }
  target.insertedAtoms.splice(index, 0, atom)
}

const adoptServerAtoms = (target: Mounted): void => {
  for (const rule of target.atoms.cssRules) {
    const className = classOfRule(rule)
    target.ruleClassNames.push(className)
    target.insertedClassNames.add(className)
    const atom = atomsByClassName.get(className)
    if (atom === undefined) {
      target.pendingClassNames.add(className)
    } else {
      target.insertedAtoms.push(atom)
    }
  }
}

/** Inserts every global, reusing the server's rule for a global when it has the same text,
 *  so the page holds one rule per global. */
const insertGlobals = (target: Mounted): void => {
  const serverRules = new Map<CSSGroupingRule, Map<string, Array<CSSRule>>>()
  for (const block of [target.globals, target.themes]) {
    const byText = new Map<string, Array<CSSRule>>()
    for (const rule of block.cssRules) {
      byText.set(rule.cssText, [...(byText.get(rule.cssText) ?? []), rule])
    }
    serverRules.set(block, byText)
  }
  for (const global of globalsById.values()) {
    insertGlobal(target, global)
    const block = global.layer === 'globals' ? target.globals : target.themes
    const inserted = target.insertedGlobals.get(global.id)
    const twin =
      inserted === undefined
        ? undefined
        : serverRules.get(block)?.get(inserted.cssText)?.shift()
    if (inserted !== undefined && twin !== undefined) {
      block.deleteRule(indexOfRule(block, inserted))
      target.insertedGlobals.set(global.id, twin)
    }
  }
}

/** Connects Pleat to the browser stylesheet in `target` and inserts every global and theme
 *  rule. Atoms are inserted later, the first time a style is used. Calling it again does
 *  nothing.
 *
 *  Hydration: when the page has a server-rendered `<style data-pleat>`, from
 *  {@link styleTag} or `@pleat/foldkit/server`, Pleat adopts that stylesheet rather than
 *  adding another. It indexes the atoms the server sent and inserts every new atom into the
 *  same sheet at its sorted position, so server-rendered elements keep their cascade while
 *  the client renders others, whether or not the client ever touches them. That covers
 *  partial hydration and widgets mounted on their own. Server rules for styles the client
 *  defines later, such as in a lazily loaded module, are put in order when they are
 *  defined. The supported model is one `<style data-pleat>` per document, rendered from the
 *  same style definitions the client loads, and left in place once the client mounts.
 *  Without one, Pleat creates its own stylesheet.
 *
 *  Unless the server's `<style data-pleat>` is already the page's first stylesheet, mounting
 *  also puts a `<style data-pleat-layers>` with Pleat's layer order at the start of the head,
 *  so Tailwind's utilities still win when its stylesheet loaded first; see {@link render}.
 *
 *  {@link use} mounts on first call, so most applications never call this directly. */
export const mount = (target: Document = document): void => {
  if (mounted !== undefined) {
    return
  }
  const isLayerOrderAdded = declareLayersFirst(target)
  const state: Mounted = {
    ...(serverSheet(target) ?? createSheet(target)),
    ruleClassNames: [],
    insertedAtoms: [],
    insertedClassNames: new Set(),
    pendingClassNames: new Set(),
    insertedGlobals: new Map(),
  }
  if (isLayerOrderAdded) {
    refreshLayerOrder(state.atoms)
  }
  mounted = state
  adoptServerAtoms(state)
  insertGlobals(state)
}

/** Makes sure every rule for `atoms` is in the browser stylesheet. On the server, does nothing.
 *
 *  Each atom is inserted at its sorted position among every atom already in the sheet,
 *  including the ones a server-rendered `<style data-pleat>` sent, so rules are ordered
 *  correctly for every element on the page. See {@link mount} for the hydration model. */
export const insert = (atoms: Iterable<Atom>): void => {
  if (mounted === undefined) {
    if (!hasDocument()) {
      return
    }
    mount()
  }
  if (mounted === undefined) {
    return
  }
  for (const atom of atoms) {
    insertAtom(mounted, atom)
  }
}

/** @internal Forgets the browser stylesheet. For tests. */
export const unmount = (): void => {
  mounted = undefined
}
