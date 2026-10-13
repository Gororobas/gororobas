import type { Html, HtmlBuilder } from 'foldkit/html'

import { Style, When } from '@pleat/core'
import { css } from '@pleat/foldkit'

import * as Design from '../design.ts'
import type { Message } from '../message.ts'
import { articleStyle, pageIntro } from './guide.ts'
import { onThisPage, rich } from './prose.ts'

const { color, font, space, text } = Design.tokens

type Entry = readonly [signature: string, description: string]
type Module = Readonly<{ name: string; summary: string; entries: ReadonlyArray<Entry> }>

const MODULES: ReadonlyArray<Module> = [
  {
    name: 'Style',
    summary:
      'Declarations under conditions. An idempotent monoid compiled to atomic classes.',
    entries: [
      [
        'Style.make(declarations)',
        'A style from a declaration block. Later keys win, including a shorthand after its longhands.',
      ],
      ['Style.empty', 'The style with no declarations; the identity of merge.'],
      [
        'Style.merge(self, that)',
        'Applies `that` after `self`. Dual: `Style.merge(that)` in a pipe. Memoized.',
      ],
      ['Style.mergeAll(styles)', 'Merges left to right.'],
      [
        'Style.when(condition, input)',
        'Adds declarations or a style under a condition. Use in a pipe.',
      ],
      [
        'Style.under(self, condition)',
        'Moves every declaration of a style under a condition.',
      ],
      [
        'Style.evolve(transforms)',
        'Maps values per property where the style is defined.',
      ],
      ['Style.mapDeclarations(self, f)', 'Maps or drops every declaration.'],
      [
        'Style.mark(marker)',
        'Puts a marker’s class on an element for relational conditions.',
      ],
      [
        'Style.get(style, property, condition?)',
        'The value declared under exactly that condition, as an Option.',
      ],
      [
        'Style.resolve(style, isActive)',
        'The declarations that take effect when the given atoms hold.',
      ],
      [
        'Style.declarations(style)',
        'Every declaration, with readable conditions, in emission order.',
      ],
      [
        'Style.use(style)',
        'The class attribute value; in a browser, also inserts the rules.',
      ],
      ['Style.Reducer, Style.Combiner', 'Merge as an Effect Reducer and Combiner.'],
    ],
  },
  {
    name: 'When',
    summary: 'Conditions, with a total precedence order.',
    entries: [
      [
        'When.always, When.all(...conditions)',
        'The top of the semilattice, and the meet.',
      ],
      [
        'When.hover, focus, focusVisible, focusWithin, active',
        'Interaction, weakest to strongest.',
      ],
      [
        'When.open, selected, checked, indeterminate, current, highlighted',
        'Element state, including `@foldkit/ui`’s `data-*` attributes.',
      ],
      [
        'When.closed, entering, leaving, transitioning',
        '`@foldkit/ui` transition states.',
      ],
      ['When.disabled, invalid, readonly', 'Disabled and invalid outrank interaction.'],
      ['When.data(name, value?), When.aria(name, value)', 'Any data or ARIA attribute.'],
      [
        'When.dark, light, reducedMotion, motionSafe, moreContrast, canHover, print',
        'Media features.',
      ],
      [
        'When.minWidth(width), maxWidth(width), media(query)',
        'Breakpoints order themselves so mobile-first works.',
      ],
      ['When.container(query, name?), supports(query)', 'Container and feature queries.'],
      ['When.marker(name)', 'A named element for relational conditions.'],
      [
        'When.within(marker, condition?), precededBy(...), has(...)',
        'Ancestor, earlier sibling, and descendant conditions.',
      ],
      ['When.not(condition), pseudo(selector)', 'Negation and other pseudo-classes.'],
      ['When.before, after, placeholder, selection, backdrop', 'Pseudo-elements.'],
      [
        'When.compare(a, b), When.label(condition)',
        'The precedence order, and a readable description.',
      ],
    ],
  },
  {
    name: 'Recipe',
    summary: 'Finite variant families typed by Schema.',
    entries: [
      [
        'Recipe.make({ name, base, variants, defaults, compounds, descriptions })',
        'Creates a recipe. Options named `true` and `false` make a boolean dimension.',
      ],
      ['recipe(props)', 'The style for those props; the same object for equal props.'],
      [
        'recipe.schema',
        'An Effect Schema for the props. Defaulted dimensions are optional.',
      ],
      [
        'recipe.dimensions, recipe.defaults',
        'The options of each dimension, and the defaults.',
      ],
      ['Recipe.combinations(recipe)', 'Every combination with its style.'],
      ['Recipe.jsonSchema(recipe)', 'A JSON Schema document for the props.'],
    ],
  },
  {
    name: 'Var',
    summary: 'Typed custom properties for continuous values.',
    entries: [
      [
        'Var.make(name, schema, { fallback })',
        'A custom property `--name` whose values the schema describes.',
      ],
      ['Var.number(name), Var.string(name)', 'Shorthands for common schemas.'],
      [
        'Var.bind(variable, value)',
        'A binding for one render. Rejects values that could end the declaration.',
      ],
    ],
  },
  {
    name: 'Token and Theme',
    summary: 'Design tokens and the values that fill them.',
    entries: [
      [
        'Token.make(spec, { prefix })',
        'Tokens from a tree of kinds; `color.onAccent` becomes `--color-on-accent`.',
      ],
      [
        'Token.color, length, duration, fontFamily, number, value',
        'Kinds, each with a Schema that validates values.',
      ],
      [
        'Theme.make(tokens, values)',
        'A theme. Throws when a value does not match its kind.',
      ],
      ['Theme.extend(theme, tokens, partialValues)', 'Overrides part of a theme.'],
      [
        'Theme.schema(tokens), Theme.decode(tokens, input)',
        'Validate generated or stored themes with typed errors.',
      ],
      ['Theme.css(theme, selector)', 'The rule that applies a theme.'],
    ],
  },
  {
    name: 'Global',
    summary: 'Rules outside the atomic layer.',
    entries: [
      [
        'Global.theme(theme, { selector, when })',
        'Applies a theme, optionally under an environment condition.',
      ],
      [
        'Global.rule(selector, declarations, { when })',
        'An element rule such as `body`.',
      ],
      [
        'Global.keyframes(name, frames)',
        'Defines an animation and returns its unique name.',
      ],
      ['Global.fontFace(declarations)', 'An `@font-face` rule.'],
    ],
  },
  {
    name: 'Calc and Color',
    summary: 'Value helpers that compile to CSS functions.',
    entries: [
      [
        'Calc.add, subtract, multiply, divide, negate, clamp, min, max',
        '`calc()` and friends. Numbers are pixels.',
      ],
      ['Color.mix(base, other, amount, space?)', '`color-mix()`.'],
      ['Color.alpha, lighten, darken, saturate, rotate', 'Relative OKLCH colors.'],
    ],
  },
  {
    name: 'Sheet',
    summary: 'The stylesheet.',
    entries: [
      ['Sheet.render({ classNames })', 'The whole sheet, or only some atoms.'],
      [
        'Sheet.renderFor(html), Sheet.styleTag(html?)',
        'A page’s critical CSS, and a `<style data-pleat>` for it.',
      ],
      [
        'Sheet.mount(document), Sheet.insert(atoms)',
        'The browser side. `css()` calls these for you.',
      ],
    ],
  },
  {
    name: '@pleat/foldkit',
    summary: 'Foldkit views and rendering.',
    entries: [
      [
        'css(...parts)',
        'Attributes for an element: one Class with every style merged, one Style with every binding.',
      ],
      ['className(value)', 'Class names Pleat does not own, passed through `css()`.'],
      [
        'renderDocument(options) from @pleat/foldkit/server',
        'Foldkit’s renderDocument with the page’s CSS in the head.',
      ],
    ],
  },
]

// STYLES

const moduleSection = Style.make({
  display: 'flex',
  flexDirection: 'column',
  gap: space[4],
  scrollMarginTop: '6rem',
})

const moduleHeader = Style.make({
  display: 'flex',
  flexDirection: 'column',
  gap: space[2],
  maxWidth: '46rem',
})

const moduleTitle = Style.make({
  fontFamily: font.sans,
  fontSize: '2rem',
  lineHeight: 1.1,
})

const entryTable = Style.make({
  borderTop: `1px solid ${color.line}`,
})

const entryRow = Style.make({
  display: 'grid',
  gap: space[1],
  paddingBlock: space[3],
  borderBottom: `1px solid ${color.line}`,
}).pipe(
  Style.when(When.minWidth('52rem'), {
    gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
    gap: space[5],
  }),
)

const signature = Style.make({
  fontFamily: font.mono,
  fontSize: '0.8125rem',
  lineHeight: 1.6,
  color: color.teal,
  overflowWrap: 'anywhere',
})

const description = Style.make({ fontSize: text.sm, color: color.muted })

const modules = Style.make({ display: 'flex', flexDirection: 'column', gap: space[8] })

// VIEW

const moduleId = (name: string): string => name.toLowerCase().replace(/[^a-z]+/g, '-')

const CONTENTS: ReadonlyArray<readonly [id: string, title: string]> = MODULES.map(
  module => [moduleId(module.name), module.name] as const,
)

export const referenceView = (h: HtmlBuilder<Message>): Html =>
  h.article(
    [...css(articleStyle)],
    [
      onThisPage(h, CONTENTS),
      pageIntro(
        h,
        'Reference',
        'Every module at a glance',
        'Everything `@pleat/core` and `@pleat/foldkit` export. Each function’s TSDoc has the details and examples.',
      ),
      h.div(
        [...css(modules)],
        MODULES.map(module =>
          h.section(
            [h.Id(moduleId(module.name)), ...css(moduleSection)],
            [
              h.div(
                [...css(moduleHeader)],
                [
                  h.h2([...css(moduleTitle)], [module.name]),
                  h.p([...css(Design.muted)], rich(h, module.summary)),
                ],
              ),
              h.div(
                [...css(entryTable)],
                module.entries.map(([name, text]) =>
                  h.div(
                    [...css(entryRow)],
                    [
                      h.code([...css(signature)], [name]),
                      h.span([...css(description)], rich(h, text)),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    ],
  )
