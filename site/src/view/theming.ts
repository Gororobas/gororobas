import { Cause, Effect, Exit, Option } from 'effect'
import type { Html, HtmlBuilder } from 'foldkit/html'

import { Style, type Theme, When } from '@pleat/core'
import { css } from '@pleat/foldkit'

import { codeBlock } from '../code.ts'
import * as Components from '../demo/theming/components.ts'
import componentsSource from '../demo/theming/components.ts?raw'
import { branded, decodeBrand } from '../demo/theming/decode.ts'
import decodeModuleSource from '../demo/theming/decode.ts?raw'
import * as Hardcoded from '../demo/theming/hardcoded.ts'
import hardcodedSource from '../demo/theming/hardcoded.ts?raw'
import {
  type Brand,
  type Density,
  type Mode,
  type Scope,
  inverted,
  scopeAttributes,
} from '../demo/theming/scope.ts'
import scopeSource from '../demo/theming/scope.ts?raw'
import '../demo/theming/themes.ts'
import themesSource from '../demo/theming/themes.ts?raw'
import { contrastPairs, semantic } from '../demo/theming/tokens.ts'
import tokensSource from '../demo/theming/tokens.ts?raw'
import * as Design from '../design.ts'
import { type BrandPreset, Message, type Model } from '../message.ts'
import { articleStyle, pageIntro } from './guide.ts'
import { bullets, paragraph, rich, section, subsection } from './prose.ts'

const { color, font, radius, space, text } = Design.tokens

// STYLES

const wide = Style.make({ display: 'flex', flexDirection: 'column', gap: space[4] })

const controls = Style.make({
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  gap: space[4],
})

const controlGroup = Style.make({
  display: 'inline-flex',
  alignItems: 'center',
  gap: space[2],
})

const caption = Style.make({
  fontFamily: font.mono,
  fontSize: text.xs,
  color: color.muted,
})

const stage = Style.make({
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr)',
  gap: space[4],
}).pipe(
  Style.when(When.minWidth('56rem'), {
    gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
  }),
)

const panel = Style.make({ display: 'flex', flexDirection: 'column', gap: space[2] })

const scopeFrame = Style.make({
  flexGrow: 1,
  display: 'grid',
  alignContent: 'start',
  gap: space[4],
  padding: space[5],
  borderRadius: radius.lg,
  border: `1px solid ${color.line}`,
})

const sample = Style.make({
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  gap: 8,
})

const codePair = Style.make({
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr)',
  gap: space[4],
}).pipe(
  Style.when(When.minWidth('64rem'), {
    gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
  }),
)

const scroller = Style.make({ maxHeight: '40rem', overflowY: 'auto' })

const table = Style.make({
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: text.sm,
})

const headerCell = Style.make({
  textAlign: 'left',
  verticalAlign: 'bottom',
  paddingBlock: space[2],
  paddingInline: space[3],
  borderBottom: `1px solid ${color.line}`,
  color: color.muted,
})

const cell = Style.make({
  minWidth: '9rem',
  textAlign: 'left',
  verticalAlign: 'top',
  paddingBlock: space[3],
  paddingInline: space[3],
  borderBottom: `1px solid ${color.line}`,
})

const tableFrame = Style.make({ overflowX: 'auto' })

const nest = Style.make({
  display: 'grid',
  gap: semantic.spacing.gap,
  padding: semantic.spacing.inset,
  borderRadius: radius.lg,
  border: `1px solid ${semantic.color.border}`,
})

const swatches = Style.make({
  display: 'grid',
  gap: space[2],
  gridTemplateColumns: 'repeat(auto-fill, minmax(11rem, 1fr))',
})

const swatchBase = Style.make({
  display: 'grid',
  gap: 2,
  padding: space[3],
  borderRadius: radius.md,
  border: `1px solid ${semantic.color.border}`,
})

const swatchSample = Style.make({ fontSize: text.lg, lineHeight: 1.1 })

const swatchName = Style.make({ fontFamily: font.mono, fontSize: text.xs })

const workbench = Style.merge(
  Design.card,
  Style.make({ display: 'grid', gap: space[5], padding: space[5] }),
).pipe(
  Style.when(When.minWidth('60rem'), {
    gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
  }),
)

const editor = Style.make({
  width: '100%',
  minHeight: 360,
  padding: space[4],
  resize: 'vertical',
  fontFamily: font.mono,
  fontSize: text.sm,
  lineHeight: 1.6,
  color: color.ink,
  backgroundColor: color.sunken,
  border: `1px solid ${color.line}`,
  borderRadius: radius.md,
}).pipe(Style.merge(Design.focusRing))

const result = Style.make({ display: 'flex', flexDirection: 'column', gap: space[3] })

const problem = Style.make({
  margin: 0,
  padding: space[4],
  borderRadius: radius.md,
  border: `1px solid ${color.accent}`,
  backgroundColor: color.accentSoft,
  fontFamily: font.mono,
  fontSize: text.xs,
  whiteSpace: 'pre-wrap',
  overflowWrap: 'anywhere',
})

// PAIRS

const PAIRS = contrastPairs.map(pair => ({
  name: `${pair.text.path.at(-1)} on ${pair.background.path.at(-1)}`,
  style: Style.merge(
    swatchBase,
    Style.make({ backgroundColor: pair.background, color: pair.text }),
  ),
}))

// COUNTS

const COLOR_LITERAL = /#[0-9a-fA-F]{3,8}\b|\b(rgb|hsl|oklch)\(/g

const colorLiterals = (source: string): number =>
  [...source.matchAll(COLOR_LITERAL)].length

const HARDCODED_COLORS = colorLiterals(hardcodedSource)
const TOKEN_COLORS = colorLiterals(componentsSource)

// LABELS

const MODES: ReadonlyArray<readonly [Mode, string]> = [
  ['Light', 'Light'],
  ['Dark', 'Dark'],
  ['HighContrast', 'High contrast'],
]

const BRANDS: ReadonlyArray<readonly [Brand, string]> = [
  ['Harbor', 'Harbor'],
  ['Orchard', 'Orchard'],
]

const DENSITIES: ReadonlyArray<readonly [Density, string]> = [
  ['Comfortable', 'Comfortable'],
  ['Compact', 'Compact'],
]

const modeLabel = (mode: Mode): string =>
  MODES.find(([value]) => value === mode)?.[1] ?? mode

const scopeLabel = (scope: Scope): string =>
  `${modeLabel(scope.mode)} · ${scope.brand} · ${scope.density}`

const otherBrand = (brand: Brand): Brand => (brand === 'Harbor' ? 'Orchard' : 'Harbor')

// DEMO

type Kit = typeof Components

const sampleView = (kit: Kit, h: HtmlBuilder<Message>): Html =>
  h.div(
    [...css(kit.card)],
    [
      h.div(
        [...css(sample)],
        [
          h.span([...css(kit.badge({ tone: 'Accent' }))], ['Admin']),
          h.span([...css(kit.badge({ tone: 'Success' }))], ['3 seats left']),
          h.span([...css(kit.badge({ tone: 'Danger' }))], ['Overdue']),
          h.span([...css(kit.badge({ tone: 'Neutral' }))], ['Draft']),
        ],
      ),
      h.h3([...css(kit.cardTitle)], ['Invite a teammate']),
      h.p(
        [...css(kit.cardBody)],
        ['They get access to every project in this workspace.'],
      ),
      h.label(
        [...css(kit.label)],
        [
          'Email',
          h.input([
            h.Type('email'),
            h.Placeholder('name@company.com'),
            ...css(kit.input),
          ]),
        ],
      ),
      h.div(
        [...css(sample)],
        [
          h.button(
            [h.Type('button'), ...css(kit.button({ tone: 'Primary' }))],
            ['Send invite'],
          ),
          h.button(
            [h.Type('button'), ...css(kit.button({ tone: 'Secondary' }))],
            ['Cancel'],
          ),
          h.button(
            [h.Type('button'), ...css(kit.button({ tone: 'Danger' }))],
            ['Remove'],
          ),
        ],
      ),
    ],
  )

const segmentControl = <A extends string>(
  h: HtmlBuilder<Message>,
  title: string,
  options: ReadonlyArray<readonly [A, string]>,
  current: A,
  toMessage: (value: A) => Message,
): Html =>
  h.div(
    [...css(controlGroup)],
    [
      h.span([...css(caption)], [title]),
      h.div(
        [h.Role('group'), h.AriaLabel(title), ...css(Design.segment)],
        options.map(([value, label]) =>
          h.button(
            [
              h.Type('button'),
              h.AriaPressed(value === current ? 'true' : 'false'),
              h.OnClick(toMessage(value)),
              ...css(Design.segmentButton),
            ],
            [label],
          ),
        ),
      ),
    ],
  )

const controlsView = (scope: Scope, h: HtmlBuilder<Message>): Html =>
  h.div(
    [...css(controls)],
    [
      segmentControl(h, 'Mode', MODES, scope.mode, mode =>
        Message.SelectedMode({ mode }),
      ),
      segmentControl(h, 'Brand', BRANDS, scope.brand, brand =>
        Message.SelectedBrand({ brand }),
      ),
      segmentControl(h, 'Density', DENSITIES, scope.density, density =>
        Message.SelectedDensity({ density }),
      ),
    ],
  )

const demoView = (scope: Scope, h: HtmlBuilder<Message>): Html =>
  h.div(
    [...css(wide)],
    [
      controlsView(scope, h),
      h.div(
        [...css(stage)],
        [
          h.div(
            [...css(panel)],
            [
              h.span([...css(caption)], ['components.ts: written against tokens']),
              h.div(
                [...scopeAttributes(h, scope), ...css(Components.scopeRoot, scopeFrame)],
                [sampleView(Components, h)],
              ),
            ],
          ),
          h.div(
            [...css(panel)],
            [
              h.span([...css(caption)], ['hardcoded.ts: values written in place']),
              h.div(
                [...css(Hardcoded.scopeRoot, scopeFrame)],
                [sampleView(Hardcoded, h)],
              ),
            ],
          ),
        ],
      ),
    ],
  )

const nestedLevel = (
  scope: Scope,
  h: HtmlBuilder<Message>,
  children: ReadonlyArray<Html>,
): Html =>
  h.div(
    [...scopeAttributes(h, scope), ...css(Components.scopeRoot, nest)],
    [
      h.span([...css(caption, Style.make({ color: 'inherit' }))], [scopeLabel(scope)]),
      ...children,
    ],
  )

const nestedView = (scope: Scope, h: HtmlBuilder<Message>): Html => {
  const panelScope: Scope = { ...inverted(scope), density: 'Compact' }
  const calloutScope: Scope = {
    ...inverted(panelScope),
    brand: otherBrand(scope.brand),
  }
  const buttons = h.div(
    [...css(sample)],
    [
      h.button(
        [h.Type('button'), ...css(Components.button({ tone: 'Primary' }))],
        ['Save'],
      ),
      h.button([h.Type('button'), ...css(Components.button({}))], ['Cancel']),
      h.span([...css(Components.badge({ tone: 'Accent' }))], ['New']),
    ],
  )
  return nestedLevel(scope, h, [
    buttons,
    nestedLevel(panelScope, h, [buttons, nestedLevel(calloutScope, h, [buttons])]),
  ])
}

const pairsView = (scope: Scope, h: HtmlBuilder<Message>): Html =>
  h.div(
    [...scopeAttributes(h, scope), ...css(Components.scopeRoot, scopeFrame)],
    [
      h.div(
        [...css(swatches)],
        PAIRS.map(pair =>
          h.div(
            [...css(pair.style)],
            [
              h.span([...css(swatchSample)], ['Aa']),
              h.span([...css(swatchName)], [pair.name]),
            ],
          ),
        ),
      ),
    ],
  )

// DECODING

type Decoded =
  | Readonly<{ _tag: 'Brand'; theme: Theme.Theme }>
  | Readonly<{ _tag: 'Problem'; message: string }>

const problemMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)

const decodeBrandSource = (source: string): Decoded => {
  let parsed: unknown
  try {
    parsed = JSON.parse(source)
  } catch (error) {
    return { _tag: 'Problem', message: `Not JSON: ${problemMessage(error)}` }
  }
  const exit = Effect.runSyncExit(decodeBrand(parsed))
  return Exit.isSuccess(exit)
    ? { _tag: 'Brand', theme: exit.value }
    : { _tag: 'Problem', message: problemMessage(Cause.squash(exit.cause)) }
}

const BRAND_PRESETS: ReadonlyArray<readonly [BrandPreset, string]> = [
  ['Valid', 'A valid brand'],
  ['MissingHash', 'A hex without #'],
  ['Injection', 'A CSS injection attempt'],
  ['WrongKind', 'A word where a length goes'],
]

const decodedView = (model: Model, h: HtmlBuilder<Message>): Html => {
  const decoded = decodeBrandSource(model.theming.brandSource)
  return decoded._tag === 'Brand'
    ? h.div(
        [...css(result)],
        [
          h.span([...css(caption)], ['Decoded and applied to this scope']),
          h.div(
            [
              ...scopeAttributes(h, model.theming.scope),
              ...branded(decoded.theme, Components.scopeRoot, scopeFrame),
            ],
            [sampleView(Components, h)],
          ),
        ],
      )
    : h.div(
        [...css(result)],
        [
          h.span([...css(caption)], ['Rejected before it became CSS']),
          h.pre([h.Role('status'), ...css(problem)], [decoded.message]),
        ],
      )
}

const decodeWorkbench = (model: Model, h: HtmlBuilder<Message>): Html =>
  h.div(
    [...css(wide)],
    [
      h.div(
        [
          h.Role('group'),
          h.AriaLabel('Example brand input'),
          ...css(Design.row(space[2])),
        ],
        BRAND_PRESETS.map(([preset, title]) =>
          h.button(
            [
              h.Type('button'),
              h.AriaPressed(
                Option.contains(model.theming.brandPreset, preset) ? 'true' : 'false',
              ),
              h.OnClick(Message.ClickedBrandPreset({ preset })),
              ...css(
                Design.button({ size: 'Small', tone: 'Quiet' }),
                Design.segmentButton,
              ),
            ],
            [title],
          ),
        ),
      ),
      h.div(
        [...css(workbench)],
        [
          h.label(
            [...css(result)],
            [
              h.span([...css(caption)], ['Brand from a settings API (editable)']),
              h.textarea([
                h.Value(model.theming.brandSource),
                h.Spellcheck(false),
                h.OnInput(source => Message.UpdatedBrandSource({ source })),
                ...css(editor),
              ]),
            ],
          ),
          decodedView(model, h),
        ],
      ),
    ],
  )

// COSTS

const COSTS: ReadonlyArray<readonly [change: string, hardcoded: string, tokens: string]> =
  [
    [
      'Add dark mode',
      `Give each of the ${HARDCODED_COLORS} color literals a second value under a dark condition, in every component.`,
      'One mode theme of semantic aliases. No component changes.',
    ],
    [
      'Ship a second brand',
      'Find every blue, its hover, and its soft tint, then fork the components or thread a brand prop through them.',
      'One `Theme.extend` with a new ramp, radii, and title face.',
    ],
    [
      'Add a compact density',
      'Change every padding, gap, and font size, or add a size prop to each component.',
      'One density theme that points spacing and type at smaller steps.',
    ],
    [
      'A dark panel on a light page',
      'Duplicate the components, or override them with descendant selectors that fight specificity.',
      'Three attributes on the panel.',
    ],
    [
      'Check contrast',
      'Read every style to work out which text sits on which background.',
      'Walk `contrastPairs` in each mode.',
    ],
  ]

const costTable = (h: HtmlBuilder<Message>): Html =>
  h.div(
    [...css(tableFrame)],
    [
      h.table(
        [...css(table)],
        [
          h.thead(
            [],
            [
              h.tr(
                [],
                ['When the design changes', 'Hardcoded', 'Tokens'].map(title =>
                  h.th([h.Scope('col'), ...css(headerCell)], [title]),
                ),
              ),
            ],
          ),
          h.tbody(
            [],
            COSTS.map(([change, hardcoded, tokens]) =>
              h.tr(
                [],
                [
                  h.th([h.Scope('row'), ...css(cell)], [change]),
                  h.td([...css(cell, Design.muted)], [hardcoded]),
                  h.td([...css(cell)], rich(h, tokens)),
                ],
              ),
            ),
          ),
        ],
      ),
    ],
  )

// VIEW

export const themingView = (model: Model, h: HtmlBuilder<Message>): Html => {
  const { scope } = model.theming
  return h.article(
    [...css(articleStyle)],
    [
      pageIntro(
        h,
        'Theming',
        'Build a design system, not a pile of values',
        'Tokens in three layers, themes that fill them, and components that only know what a value is for. Change the mode, the brand, or the density, and nothing in a component changes.',
      ),
      section(h, 'try', 'The same components, twice', [
        paragraph(
          h,
          'Both panels render the same card with the same markup. The left one reads tokens; the right one has its values written in place. They start out identical. Change the design and see which one follows.',
        ),
      ]),
      demoView(scope, h),
      section(h, 'layers', 'Three layers of tokens', [
        paragraph(
          h,
          'A design system needs more than a list of colors. Pleat’s `Token.make` takes any tree of kinds, so the layers are just three trees:',
        ),
        bullets(h, [
          '**Primitives** are the palette: color ramps, a spacing scale, radii, type sizes, typefaces, shadows. They are the only layer with literal values, and no component reads them.',
          '**Semantic tokens** say what a value is for: `surface`, `text`, `textMuted`, `accent`, `onAccent`, `danger`, `spacing.inset`, `typography.title`. Components read only these.',
          '**Component tokens** are the few knobs one component owns, such as `button.radius`, so every button can change without every control changing.',
        ]),
        paragraph(
          h,
          'Text colors and the backgrounds they sit on come in named pairs: `text` on `surface`, `onAccent` on `accent`, `onDangerSoft` on `dangerSoft`. The file lists them in `contrastPairs`, so a contrast check can walk them in every mode.',
        ),
        codeBlock(h, tokensSource, 'tokens.ts'),
      ]),
      section(h, 'themes', 'Themes fill each layer', [
        paragraph(
          h,
          'A theme can cover any tree of tokens, and a value can be another token. That gives each layer its own themes, and each theme a small job:',
        ),
        bullets(h, [
          '**Brands** give the primitives values. Harbor is the base; Orchard is `Theme.extend(harbor, …)` with a new ramp, rounder corners, and a serif for titles.',
          '**Modes** point semantic colors at primitives. Dark and high contrast extend light, so each one lists only what differs.',
          '**Densities** point semantic spacing and type at different steps of the scales.',
          '**The system theme** holds aliases that never change, such as `button.radius` → `shape.control` → `radius.md`.',
        ]),
        paragraph(
          h,
          '`Global.theme` applies each one at an attribute selector. Because an alias resolves wherever it is declared, a brand changes `brand[600]` and `accent` follows in every mode, with nothing written twice. Aliases are checked by kind, so pointing `surface` at a spacing step is a type error.',
        ),
        codeBlock(h, themesSource, 'themes.ts'),
      ]),
      section(h, 'components', 'Components read only semantic tokens', [
        paragraph(
          h,
          `Here are the two files behind the panels above. They have the same structure. The difference is where the values live. \`hardcoded.ts\` has ${HARDCODED_COLORS} color literals. \`components.ts\` has ${TOKEN_COLORS}.`,
        ),
      ]),
      h.div(
        [...css(codePair)],
        [
          h.div([...css(scroller)], [codeBlock(h, componentsSource, 'components.ts')]),
          h.div([...css(scroller)], [codeBlock(h, hardcodedSource, 'hardcoded.ts')]),
        ],
      ),
      h.div(
        [...css(Design.prose)],
        [
          paragraph(
            h,
            'The hardcoded version is not wrong today. It costs more each time the design moves:',
          ),
          costTable(h),
        ],
      ),
      section(h, 'scopes', 'Scoped and nested themes', [
        paragraph(
          h,
          'A scope is an element with the three attributes. Everything under it reads that scope’s values, and scopes nest: a dark panel on a light page is a scope inside a scope.',
        ),
        paragraph(
          h,
          'The page scope below follows the controls at the top. Inside it, a panel inverts the mode and turns compact, and inside that, a callout inverts again and switches brand. One component definition renders all three.',
        ),
      ]),
      nestedView(scope, h),
      h.div(
        [...css(Design.prose)],
        [
          subsection(h, 'Set every axis on a scope', [
            paragraph(
              h,
              'Custom properties resolve `var()` where they are declared, and descendants inherit the result. If a nested scope set only a new brand, the semantic `accent` it inherited would still hold the outer brand’s color. Setting all three attributes on every scope re-declares every alias there, so they resolve against the scope’s own values. `scopeAttributes` makes that the only way to write one.',
            ),
            codeBlock(h, scopeSource, 'scope.ts'),
          ]),
        ],
      ),
      section(h, 'decode', 'Themes from outside the program', [
        paragraph(
          h,
          'Some themes arrive at runtime: a customer’s brand from a settings API, or a palette a language model proposes. `Theme.decodePartial` checks each value it is given against its token’s kind and fails with a `SchemaError` that names the path, so a bad value never becomes CSS. It is the same closed-world idea as [generative interfaces](/generative): outside input can choose values, never write rules.',
        ),
        codeBlock(h, decodeModuleSource, 'decode.ts'),
        paragraph(
          h,
          'Edit the JSON or pick an example. A valid brand is applied inline to one scope, and every semantic alias below it follows, in whichever mode the controls at the top have chosen.',
        ),
      ]),
      decodeWorkbench(model, h),
      section(h, 'contrast', 'Contrast pairs', [
        paragraph(
          h,
          'Every pair in `contrastPairs`, rendered in the scope chosen at the top. Switch modes to see each pair hold up, or not.',
        ),
      ]),
      pairsView(scope, h),
    ],
  )
}
