import type { Html, HtmlBuilder } from 'foldkit/html'

import { css } from '@pleat/foldkit'

import { codeBlock } from '../code.ts'
import type { Message } from '../message.ts'
import { articleStyle, pageIntro } from './guide.ts'
import { bullets, onThisPage, paragraph, section, subsection } from './prose.ts'

const LAWS = `// Style is an idempotent monoid (a band) under merge.
merge(merge(a, b), c) === merge(a, merge(b, c))   // associative
merge(Style.empty, a) === a === merge(a, Style.empty) // identity
merge(a, a) === a                                  // idempotent
merge(merge(a, b), a) === merge(b, a)              // right regular

// Equal styles are the same object, so the laws hold up to ===.
// Style.Reducer is the same structure as an Effect Reducer.
Style.Reducer.combineAll([base, tone, size]) === Style.mergeAll([base, tone, size])`

const MEANING = `// What a style means: the declarations that take effect when some
// conditions hold. The compiled rules have to agree with this function.
Style.resolve(button({ tone: 'Primary' }), atom => atom.key === When.hover.key)
// { display: 'inline-flex', backgroundColor: 'oklch(from var(--color-accent) …)', … }`

const PRECEDENCE = `// Weakest to strongest. A condition is as strong as its strongest atom;
// ties go to the condition with more atoms.
@supports  <  @media  <  maxWidth (narrow wins)  <  minWidth (wide wins)  <  @container
  <  within / precededBy / has
  <  data-* and aria-* state  <  open  <  selected, checked, current  <  highlighted
  <  :hover  <  :focus-within  <  :focus  <  :focus-visible  <  :active
  <  invalid  <  disabled
  <  pseudo-elements (a different box, so they never compete)`

const SELECTIVE = `// A monad: the next style depends on props at run time,
// so nothing can know the CSS before render.
chain: (Style a, a -> Style b) -> Style b

// Pleat: a selective functor. Every branch is a finished value; the Model
// only chooses. The set of rules is the union of the branches, known statically.
Recipe<Props> ≅ (Props -> Style)   with Props finite and described by a Schema`

const NATURAL = `// Transforms produce CSS functions over tokens, not colors.
const darkenText = Style.evolve({ color: c => Color.darken(c, 0.1) })
darkenText(Style.make({ color: tokens.color.accent }))
// color: oklch(from var(--color-accent) calc(l - 0.1) c h)

// The browser evaluates it after the theme sets --color-accent, so
// transform-then-theme equals theme-then-transform for every theme.`

const CONTENTS: ReadonlyArray<readonly [id: string, title: string]> = [
  ['band', 'Styles form a band'],
  ['meaning', 'What a style means'],
  ['conditions', 'Conditions and precedence'],
  ['recipes', 'Recipes are selective functors'],
  ['staging', 'Variables stage the rest'],
  ['transforms', 'Transforms commute with themes'],
  ['checked', 'How it is checked'],
  ['limits', 'Limits'],
]

export const algebraView = (h: HtmlBuilder<Message>): Html =>
  h.article(
    [...css(articleStyle)],
    [
      onThisPage(h, CONTENTS),
      pageIntro(
        h,
        'The algebra',
        'Why it is lawful, and why it can be fast',
        'Pleat is a small algebra over CSS. Each piece has a structure chosen so the stylesheet can be known before the first render. Here is what each structure is, what it buys, and how it is checked.',
      ),
      section(h, 'band', 'Styles form a band', [
        paragraph(
          h,
          'A style is a set of atoms. An atom is one declaration under one condition, and the pair of condition and property is its slot. Merging applies the right side after the left: an atom replaces the atom in its slot, and a shorthand also removes the longhands it covers under the same condition. That is object spread, made exact for CSS.',
        ),
        codeBlock(h, LAWS),
        paragraph(
          h,
          'Idempotence is what makes composition safe to repeat: applying a shared focus ring twice, or a theme override that is already there, changes nothing. Right regularity says the last application of a style is the one that counts, which is the intuition everyone already has for CSS overrides.',
        ),
        paragraph(
          h,
          'Styles are interned, so equal styles are the same object. Merges are memoized by identity, which is why merging in a view costs a lookup.',
        ),
      ]),
      section(h, 'meaning', 'What a style means', [
        paragraph(
          h,
          '`Style.resolve` is the meaning of a style: given which condition atoms hold, it returns the declarations that take effect. Compiling a style to CSS is correct when the browser’s cascade over the compiled rules gives the same answer for every style and every set of active conditions.',
        ),
        codeBlock(h, MEANING),
        paragraph(
          h,
          'Three things make that true. Every rule is wrapped so its specificity is exactly one class (`.p1x2y3z4:where(:hover)`). Rules are emitted in precedence order, and longhands after their shorthands. And all of them sit in the `pleat.atoms` layer, so nothing else interleaves.',
        ),
      ]),
      section(h, 'conditions', 'Conditions and precedence', [
        paragraph(
          h,
          'Conditions form a meet-semilattice: `When.all` is the meet and `When.always` is the top. `Style.when(c, s)` moves `s` under `c`; nesting conjoins, so `when(c, when(d, s))` is `when(all(c, d), s)`, and `when(c)` distributes over merge for conditions the style does not already mention.',
        ),
        paragraph(
          h,
          'Atomic rules cannot remember the order you wrote them in across different conditions, so Pleat fixes a total order instead. When two conditions hold at once and set the same property, the stronger one wins:',
        ),
        codeBlock(h, PRECEDENCE),
        paragraph(
          h,
          'This is the order component libraries want: a disabled button does not light up on hover, and pressing beats hovering. When you want a particular combination, say so with `When.all`, which outranks each of its parts.',
        ),
      ]),
      section(h, 'recipes', 'Recipes are selective functors', [
        paragraph(
          h,
          'The obvious way to vary a style by props is to make styles a monad over them, so each step can read the props. But a monad lets the next step depend on a value computed at run time, which is exactly what keeps the CSS unknown until render. Applicative functors are the opposite: the structure is fixed, so it can be analyzed, but nothing can branch.',
        ),
        paragraph(
          h,
          'Recipes sit between the two, as selective functors: every branch is visible ahead of time, and the run-time value only selects among them. That is enough for variant props driven by a Model, and it means the rules a recipe can produce are the union of its branches, compiled when the module loads.',
        ),
        codeBlock(h, SELECTIVE),
        paragraph(
          h,
          'Because props are finite, a recipe is a table in disguise: a function from a finite set is the same thing as one value per element. Pleat fills the table lazily and memoizes it, so a call is a lookup per dimension.',
        ),
      ]),
      section(h, 'staging', 'Variables stage the rest', [
        paragraph(
          h,
          'Some values are not finite: a progress percentage, a pointer position, a hue a user picks. A `Var` splits them into a static rule that refers to `var(--name)` and a dynamic binding of one custom property per render. The static part goes through the same algebra; only the binding is computed in the view.',
        ),
      ]),
      section(h, 'transforms', 'Transforms commute with themes', [
        paragraph(
          h,
          '`Style.evolve` maps values where a style is defined, and the color and size helpers return CSS functions rather than computed values. So a transform stays correct under any theme, and swapping a theme never requires recomputing a style.',
        ),
        codeBlock(h, NATURAL),
        paragraph(
          h,
          '`evolve` distributes over merge, so a transform applied to a composed style equals the composition of the transformed parts.',
        ),
      ]),
      section(h, 'checked', 'How it is checked', [
        bullets(h, [
          'Property-based tests (fast-check) check associativity, identity, idempotence, right regularity, the Effect `Reducer`, conjunction of nested conditions, distribution of `when` and `evolve` over merge, and that the same declarations always compile to the same classes.',
          'A Chromium test builds hundreds of random styles from overlapping shorthands, longhands, and stacked conditions, renders them under random states (hover and focus-visible forced through the DevTools protocol, dark mode emulated, breakpoints by viewport), and compares every computed value with `Style.resolve`. It runs both delivery paths: the server-rendered sheet, and the browser inserting rules next to a partial server sheet.',
          'That test was checked by breaking the compiler on purpose: emitting rules unsorted, inserting them at the wrong position, and dropping the specificity equalization each make it fail.',
          'Class names are a snapshot-tested contract, because server-rendered pages and hydrating clients must compute the same ones.',
        ]),
      ]),
      section(h, 'limits', 'Limits', [
        subsection(h, 'Shorthands that overlap without nesting', [
          paragraph(
            h,
            '`borderTop` and `borderColor` each set some of the other’s longhands. Atomic rules cannot keep their relative order, so Pleat warns in development when they meet. Write one of them as longhands.',
          ),
        ]),
        subsection(h, 'Logical and physical properties', [
          paragraph(
            h,
            '`paddingInline` and `paddingLeft` set the same box side in left-to-right text, but Pleat treats them as separate families, as most atomic CSS tools do. Pick one family per property.',
          ),
        ]),
        subsection(h, 'Styles created during render', [
          paragraph(
            h,
            'Calling `Style.make` inside a view works, but every distinct value becomes a new rule. Use a recipe for finite choices and a `Var` for continuous ones.',
          ),
        ]),
      ]),
    ],
  )
