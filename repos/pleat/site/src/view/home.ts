import type { Html, HtmlBuilder } from 'foldkit/html'

import { Recipe, Style, When } from '@pleat/core'
import { css } from '@pleat/foldkit'

import { codeBlock } from '../code.ts'
import * as Design from '../design.ts'
import { Message, type Model, type Size, type Tone } from '../message.ts'
import { algebraRouter, generativeRouter, guideRouter } from '../route.ts'
import quickstartSource from '../snippet/quickstart.ts?raw'
import transformsSource from '../snippet/transforms.ts?raw'
import { FACE_COUNT, pleatView } from './pleat.ts'
import { paragraph, rich } from './prose.ts'

const { color, font, radius, space, text } = Design.tokens

// STYLES

const wide = When.minWidth('60rem')

const section = Style.merge(
  Design.container,
  Style.make({ paddingBlock: space[8] }),
).pipe(Style.when(wide, { paddingBlock: space[9] }))

const sectionTitle = Style.merge(
  Design.heading,
  Style.make({ maxWidth: '26ch', marginBlockEnd: space[6] }),
)

// HERO

const heroTitle = Style.merge(
  Design.container,
  Style.make({ paddingBlockStart: space[8], paddingBlockEnd: space[6] }),
).pipe(Style.when(wide, { paddingBlockStart: space[9], paddingBlockEnd: space[7] }))

const title = Style.merge(Design.hero, Style.make({ maxWidth: '14ch' }))

const bandCaption = Style.merge(
  Design.container,
  Style.make({
    display: 'flex',
    justifyContent: 'space-between',
    gap: space[4],
    paddingBlockStart: space[3],
    fontSize: text.xs,
    color: color.muted,
  }),
)

const whenHoverable = Style.make({ display: 'none' }).pipe(
  Style.when(When.canHover, { display: 'inline' }),
)

const dek = Style.merge(
  Design.container,
  Style.make({
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr)',
    gap: space[6],
    alignItems: 'start',
    paddingBlockStart: space[7],
    paddingBlockEnd: space[8],
  }),
).pipe(
  Style.when(wide, {
    gridTemplateColumns: 'minmax(0, 1.2fr) minmax(0, 1fr)',
    gap: space[8],
    paddingBlockStart: space[8],
    paddingBlockEnd: space[9],
  }),
)

const actions = Style.make({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'flex-start',
  gap: space[5],
}).pipe(Style.when(wide, { paddingBlockStart: space[2] }))

const install = Style.make({
  display: 'inline-flex',
  alignItems: 'center',
  gap: space[3],
  maxWidth: '100%',
  overflowX: 'auto',
  paddingBlockStart: space[4],
  borderTop: `1px solid ${color.line}`,
  fontFamily: font.mono,
  fontSize: text.xs,
  whiteSpace: 'nowrap',
}).pipe(Style.when(When.before, { content: '"$"', color: color.muted }))

// MANIFESTO

const manifesto = Style.merge(
  Design.container,
  Style.make({ paddingBlockEnd: space[8] }),
).pipe(Style.when(wide, { paddingBlockEnd: space[9] }))

const manifestoText = Style.make({
  maxWidth: '46rem',
  fontSize: 'clamp(1.375rem, 2.4vw, 1.875rem)',
  lineHeight: 1.3,
  textWrap: 'pretty',
})

// SPECIMEN

// NOTE: the specimen compiles a real style and shows what Pleat made of it,
// so the page can't drift from the library.
const specimenStyle = Style.make({
  display: 'grid',
  gap: 12,
  padding: 20,
  borderRadius: 12,
}).pipe(
  Style.when(When.hover, { translate: '0 -2px' }),
  Style.when(When.minWidth('40rem'), { padding: 28 }),
)

const SPECIMEN_SOURCE = `const card = Style.make({
  display: 'grid',
  gap: 12,
  padding: 20,
  borderRadius: 12,
}).pipe(
  Style.when(When.hover, { translate: '0 -2px' }),
  Style.when(When.minWidth('40rem'), { padding: 28 }),
)`

const threeWide = When.minWidth('72rem')

const specimen = Style.make({
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr)',
  minWidth: 0,
  borderTop: `1px solid ${color.line}`,
  borderBottom: `1px solid ${color.line}`,
}).pipe(
  Style.when(threeWide, {
    gridTemplateColumns: 'minmax(0, 1.1fr) minmax(0, 1fr) minmax(0, 0.8fr)',
  }),
)

const stage = Style.make({
  display: 'flex',
  flexDirection: 'column',
  gap: space[4],
  minWidth: 0,
  paddingBlock: space[5],
  borderTop: `1px solid ${color.line}`,
}).pipe(
  Style.when(When.firstChild, { borderTop: 'none' }),
  Style.when(threeWide, {
    borderTop: 'none',
    paddingInline: space[5],
    borderInlineStart: `1px solid ${color.line}`,
  }),
  Style.when(When.all(threeWide, When.firstChild), {
    paddingInlineStart: 0,
    borderInlineStart: 'none',
  }),
  Style.when(When.all(threeWide, When.lastChild), { paddingInlineEnd: 0 }),
)

const stageLabel = Style.merge(Design.eyebrow, Style.make({ gap: space[3] }))

const stageNumber = Style.make({
  fontFamily: font.sans,
  fontSize: text.md,
  letterSpacing: 0,
  color: color.accent,
})

const specimenCode = Style.make({
  margin: 0,
  fontFamily: font.mono,
  fontSize: '0.75rem',
  lineHeight: 1.7,
  whiteSpace: 'pre',
  overflowX: 'auto',
})

const scroller = Style.make({ overflowX: 'auto' })

const atomTable = Style.make({
  width: '100%',
  borderCollapse: 'collapse',
  fontFamily: font.mono,
  fontSize: '0.75rem',
})

const atomCell = Style.make({
  textAlign: 'start',
  paddingBlock: 4,
  paddingInlineEnd: space[3],
  borderBottom: `1px solid ${color.line}`,
  whiteSpace: 'nowrap',
}).pipe(Style.when(When.lastChild, { paddingInlineEnd: 0 }))

const conditionCell = Style.merge(atomCell, Style.make({ color: color.teal }))

const classOutput = Style.make({
  margin: 0,
  fontFamily: font.mono,
  fontSize: '0.75rem',
  lineHeight: 1.7,
  overflowWrap: 'anywhere',
})

const classValue = Style.make({ color: color.madder })

const ledger = Style.make({
  display: 'grid',
  gap: space[4],
  marginBlockStart: space[6],
  fontSize: text.sm,
  color: color.muted,
}).pipe(
  Style.when(When.minWidth('40rem'), {
    gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
  }),
)

const ledgerFigure = Style.make({
  display: 'block',
  fontFamily: font.sans,
  fontSize: text.xl,
  color: color.ink,
  lineHeight: 1.1,
  marginBlockEnd: space[1],
  fontVariantNumeric: 'tabular-nums',
})

// HOW IT WORKS

const split = Style.make({
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr)',
  gap: space[7],
  alignItems: 'start',
  minWidth: 0,
}).pipe(
  Style.when(wide, {
    gridTemplateColumns: 'minmax(0, 1.1fr) minmax(0, 1fr)',
    gap: space[8],
  }),
)

const steps = Style.make({
  listStyle: 'none',
  margin: 0,
  padding: 0,
  display: 'flex',
  flexDirection: 'column',
})

const step = Style.make({
  display: 'grid',
  gridTemplateColumns: '2.25rem minmax(0, 1fr)',
  gap: space[3],
  paddingBlock: space[5],
  borderTop: `1px solid ${color.line}`,
}).pipe(Style.when(When.firstChild, { borderTop: 'none', paddingBlockStart: 0 }))

const stepNumber = Style.make({
  fontFamily: font.sans,
  fontSize: text.xl,
  lineHeight: 1,
  color: color.accent,
  paddingBlockStart: 2,
})

// WHAT YOU GET

const pillars = Style.make({
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr)',
  margin: 0,
  borderTop: `1px solid ${color.line}`,
}).pipe(
  Style.when(When.minWidth('48rem'), {
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    columnGap: space[8],
  }),
)

const pillar = Style.make({
  display: 'flex',
  flexDirection: 'column',
  gap: space[3],
  paddingBlock: space[6],
  borderBottom: `1px solid ${color.line}`,
})

const pillarTitle = Style.make({
  fontFamily: font.sans,
  fontSize: text.xl,
  lineHeight: 1.15,
})

// PLAYGROUND

const intro = Style.merge(Design.body, Style.make({ maxWidth: '42rem' }))

const playground = Style.make({ display: 'flex', flexDirection: 'column', gap: space[6] })

const controls = Style.make({
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'flex-start',
  gap: space[6],
})

const control = Style.make({ display: 'flex', flexDirection: 'column', gap: space[2] })

const controlLabel = Style.make({
  fontFamily: font.mono,
  fontSize: '0.75rem',
  color: color.muted,
  overflowWrap: 'anywhere',
})

const liveStage = Style.make({
  position: 'relative',
  display: 'grid',
  placeItems: 'center',
  minHeight: 220,
  padding: space[6],
  borderBlock: `1px solid ${color.line}`,
})

const stageCaption = Style.merge(
  Design.eyebrow,
  Style.make({ position: 'absolute', top: space[3], insetInlineStart: 0 }),
)

const output = Style.make({
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr)',
  gap: space[6],
}).pipe(
  Style.when(wide, {
    gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
    gap: space[8],
  }),
)

const mono = Style.make({
  fontFamily: font.mono,
  fontSize: '0.75rem',
  lineHeight: 1.7,
  overflowWrap: 'anywhere',
  margin: 0,
  whiteSpace: 'pre-wrap',
})

const schemaFrame = Style.merge(
  mono,
  Style.make({
    maxHeight: 360,
    overflowY: 'auto',
    padding: space[4],
    borderRadius: radius.lg,
    backgroundColor: color.sunken,
  }),
)

const tableFrame = Style.make({ maxHeight: 300, overflowY: 'auto' })

const declarationTable = Style.make({
  width: '100%',
  borderCollapse: 'collapse',
  fontFamily: font.mono,
  fontSize: '0.75rem',
})

const cell = Style.make({
  textAlign: 'start',
  paddingBlock: space[1],
  paddingInlineEnd: space[3],
  borderBottom: `1px solid ${color.line}`,
  verticalAlign: 'top',
})

const headCell = Style.merge(
  cell,
  Style.make({
    color: color.muted,
    position: 'sticky',
    top: 0,
    backgroundColor: color.canvas,
  }),
)

// CLOSING

const closing = Style.merge(Design.container, Style.make({ paddingBlockEnd: space[9] }))

const closingInner = Style.make({
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr)',
  gap: space[6],
  paddingBlockStart: space[7],
  borderTop: `1px solid ${color.line}`,
}).pipe(
  Style.when(wide, {
    gridTemplateColumns: 'minmax(0, 1.4fr) auto',
    alignItems: 'end',
    gap: space[8],
  }),
)

const closingText = Style.make({
  fontFamily: font.sans,
  fontSize: 'clamp(1.75rem, 3.4vw, 2.75rem)',
  lineHeight: 1.1,
  letterSpacing: '-0.01em',
  textWrap: 'balance',
  maxWidth: '22ch',
})

// VIEW

const TONES: ReadonlyArray<Tone> = ['Primary', 'Neutral', 'Quiet']
const SIZES: ReadonlyArray<Size> = ['Small', 'Medium', 'Large']

const segmented = <Option extends string>(
  h: HtmlBuilder<Message>,
  label: string,
  options: ReadonlyArray<Option>,
  selected: Option,
  toMessage: (option: Option) => Message,
): Html =>
  h.div(
    [...css(control)],
    [
      h.span([...css(controlLabel)], [label]),
      h.div(
        [h.Role('group'), h.AriaLabel(label), ...css(Design.segment)],
        options.map(option =>
          h.button(
            [
              h.Type('button'),
              h.AriaPressed(option === selected ? 'true' : 'false'),
              h.OnClick(toMessage(option)),
              ...css(Design.segmentButton),
            ],
            [option],
          ),
        ),
      ),
    ],
  )

const buttonSchemaDocument = Recipe.jsonSchema(Design.button)
const buttonSchema = JSON.stringify(
  buttonSchemaDocument.definitions['Button'] ?? buttonSchemaDocument.schema,
  null,
  2,
)

const stageView = (
  h: HtmlBuilder<Message>,
  number: string,
  label: string,
  content: Html,
): Html =>
  h.div(
    [...css(stage)],
    [
      h.span([...css(stageLabel)], [h.span([...css(stageNumber)], [number]), label]),
      content,
    ],
  )

const LEDGER: ReadonlyArray<readonly [figure: string, body: string]> = [
  ['90 ns', 'to resolve a recipe to its class names. cva takes 228.'],
  ['0 rules', 'created during render. Each exists once its module loads.'],
  ['1 class', 'per declaration, shared by every style that uses it.'],
  ['4 laws', 'checked by property tests, and in Chromium against the cascade.'],
]

const specimenView = (h: HtmlBuilder<Message>): Html =>
  h.figure(
    [h.AriaLabel('What Pleat compiles a style to')],
    [
      h.div(
        [...css(specimen)],
        [
          stageView(
            h,
            '1',
            'A value you write',
            h.pre([...css(specimenCode)], [SPECIMEN_SOURCE]),
          ),
          stageView(
            h,
            '2',
            'Atoms, compiled at module load',
            h.div(
              [...css(scroller)],
              [
                h.table(
                  [...css(atomTable)],
                  [
                    h.tbody(
                      [],
                      Style.declarations(specimenStyle).map(entry =>
                        h.tr(
                          [],
                          [
                            h.td([...css(conditionCell)], [entry.condition]),
                            h.td([...css(atomCell)], [entry.property]),
                            h.td([...css(atomCell)], [entry.value]),
                          ],
                        ),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
          stageView(
            h,
            '3',
            'One attribute for the view',
            h.p(
              [...css(classOutput)],
              [
                'css(card)\n→ class="',
                h.span([...css(classValue)], [specimenStyle.className]),
                '"',
              ],
            ),
          ),
        ],
      ),
      h.dl(
        [...css(ledger)],
        LEDGER.map(([figure, body]) =>
          h.div([], [h.dt([...css(ledgerFigure)], [figure]), h.dd([], [body])]),
        ),
      ),
    ],
  )

const playgroundView = (model: Model, h: HtmlBuilder<Message>): Html => {
  const { tone, size, isPending } = model.playground
  const style = Design.button({ tone, size, isPending })
  return h.div(
    [...css(playground)],
    [
      h.div(
        [...css(controls)],
        [
          segmented(h, 'tone', TONES, tone, option =>
            Message.SelectedTone({ tone: option }),
          ),
          segmented(h, 'size', SIZES, size, option =>
            Message.SelectedSize({ size: option }),
          ),
          segmented(
            h,
            'isPending',
            ['false', 'true'],
            isPending ? 'true' : 'false',
            option => Message.UpdatedPending({ isPending: option === 'true' }),
          ),
        ],
      ),
      h.div(
        [...css(liveStage)],
        [
          h.span([...css(stageCaption)], ['Live']),
          h.button(
            [h.Type('button'), ...css(style)],
            [isPending ? 'Saving…' : 'Save changes'],
          ),
        ],
      ),
      h.div(
        [...css(output)],
        [
          h.div(
            [...css(Design.stack(space[3]))],
            [
              h.span(
                [...css(controlLabel)],
                [`button(${JSON.stringify({ tone, size, isPending })})`],
              ),
              h.p([...css(mono)], [`class="${style.className}"`]),
              h.div(
                [...css(tableFrame)],
                [
                  h.table(
                    [...css(declarationTable)],
                    [
                      h.thead(
                        [],
                        [
                          h.tr(
                            [],
                            ['condition', 'property', 'value'].map(label =>
                              h.th([...css(headCell)], [label]),
                            ),
                          ),
                        ],
                      ),
                      h.tbody(
                        [],
                        Style.declarations(style).map(entry =>
                          h.tr(
                            [],
                            [entry.condition, entry.property, entry.value].map(value =>
                              h.td([...css(cell)], [value]),
                            ),
                          ),
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ],
          ),
          h.div(
            [...css(Design.stack(space[3]))],
            [
              h.span([...css(controlLabel)], ['Recipe.jsonSchema(button)']),
              h.pre([...css(schemaFrame)], [buttonSchema]),
            ],
          ),
        ],
      ),
    ],
  )
}

const STEPS: ReadonlyArray<readonly [title: string, body: string]> = [
  [
    'Define',
    '`Style.make` turns declarations into atoms: one condition, one property, one value, one class. `card` and every `badge` option exist as rules the moment this module loads.',
  ],
  [
    'Choose',
    'In the view, `badge({ status })` picks a finished style with a few map lookups, and `css()` hands Foldkit one `Class` attribute it has already built. Nothing about CSS happens during render.',
  ],
  [
    'Ship',
    'On the server, `renderDocument` puts the rules a page uses in its `<head>`. The client computes the same class names, so hydration matches.',
  ],
]

const PILLARS: ReadonlyArray<readonly [title: string, body: string]> = [
  [
    'Lawful',
    'Merging is associative, has an identity, and changes nothing when repeated. Property tests check the laws, and a Chromium test checks that the cascade agrees with them.',
  ],
  [
    'Built for Foldkit',
    'One `css()` spread per element. Conditions match `@foldkit/ui` states like `data-open` and `data-disabled`. Variant props are Schemas, like your Model.',
  ],
  [
    'Fast on both sides',
    'Every rule exists before the first render. A recipe resolves in about 90 ns. Each server-rendered page ships only the CSS it uses.',
  ],
  [
    'Safe to generate',
    'Recipes and themes export JSON Schema. A model chooses among styles that are already compiled, so it never writes CSS.',
  ],
]

export const homeView = (model: Model, h: HtmlBuilder<Message>): Html =>
  h.div(
    [],
    [
      h.section(
        [h.AriaLabel('Introduction')],
        [
          h.div(
            [...css(heroTitle)],
            [h.h1([...css(title)], ['Styles are values. Pleat folds them.'])],
          ),
          pleatView(h),
          h.p(
            [...css(bandCaption)],
            [
              h.span(
                [],
                [
                  `${FACE_COUNT} elements and two conditions. No JavaScript moves it. `,
                  h.span([...css(whenHoverable)], ['Run your pointer across it.']),
                ],
              ),
            ],
          ),
          h.div(
            [...css(dek)],
            [
              h.p(
                [...css(Design.lede)],
                [
                  'Merge, nest, and vary styles by Model, with laws that hold. Pleat compiles every rule to atomic CSS before the first render, so your views only choose among them.',
                ],
              ),
              h.div(
                [...css(actions)],
                [
                  h.div(
                    [...css(Design.row(space[4]))],
                    [
                      h.a(
                        [
                          h.Href(guideRouter()),
                          ...css(Design.button({ tone: 'Primary', size: 'Large' })),
                        ],
                        ['Read the guide'],
                      ),
                      h.a(
                        [h.Href(algebraRouter()), ...css(Design.link)],
                        ['See the algebra'],
                      ),
                    ],
                  ),
                  h.code([...css(install)], ['pnpm add @pleat/core @pleat/foldkit']),
                ],
              ),
            ],
          ),
        ],
      ),
      h.section(
        [h.AriaLabel('In brief'), ...css(manifesto)],
        [
          h.p(
            [...css(manifestoText)],
            [
              'A style is data, so everything about it is known before the first render. A recipe call is a few map lookups. A server-rendered page ships only the CSS it uses. And a language model building your interface can choose styles, but never write CSS.',
            ],
          ),
        ],
      ),
      h.section(
        [...css(Design.container)],
        [h.h2([...css(sectionTitle)], ['What Pleat makes of a style']), specimenView(h)],
      ),
      h.section(
        [...css(section)],
        [
          h.h2([...css(sectionTitle)], ['How it works']),
          h.div(
            [...css(split)],
            [
              codeBlock(h, quickstartSource, 'post.ts'),
              h.ol(
                [...css(steps)],
                STEPS.map(([heading, body], index) =>
                  h.li(
                    [...css(step)],
                    [
                      h.span([...css(stepNumber)], [`${index + 1}`]),
                      h.div(
                        [...css(Design.stack(space[2]))],
                        [
                          h.h3([...css(Design.subheading)], [heading]),
                          h.p([...css(Design.muted)], rich(h, body)),
                        ],
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
      h.section(
        [...css(Design.container)],
        [
          h.h2([...css(sectionTitle)], ['What you get']),
          h.dl(
            [...css(pillars)],
            PILLARS.map(([heading, body]) =>
              h.div(
                [...css(pillar)],
                [
                  h.dt([...css(pillarTitle)], [heading]),
                  h.dd([...css(Design.muted)], rich(h, body)),
                ],
              ),
            ),
          ),
        ],
      ),
      h.section(
        [h.Id('playground'), ...css(section)],
        [
          h.div(
            [...css(Design.stack(space[4]))],
            [
              h.h2([...css(Design.heading)], ['Try a recipe']),
              h.p(
                [...css(intro)],
                rich(
                  h,
                  'This is the button this site uses. Each choice below is a Message; the view calls `button(props)` and gets back a style that was compiled when the page loaded. The JSON Schema is what a model would see.',
                ),
              ),
            ],
          ),
          h.div([...css(Style.make({ height: space[7] }))]),
          playgroundView(model, h),
        ],
      ),
      h.section(
        [...css(Design.container)],
        [
          h.div(
            [...css(split)],
            [
              h.div(
                [...css(Design.stack(space[4]))],
                [
                  h.h2(
                    [...css(Design.heading)],
                    ['Change styles with functions, not overrides'],
                  ),
                  paragraph(
                    h,
                    'A transform is a function from style to style. `Style.evolve` maps values where they are declared, and `Calc` and `Color` return CSS functions over your tokens, so a transform written once holds under every theme.',
                  ),
                  paragraph(
                    h,
                    'Recipes take finished styles as branches. Props pick a branch; they never build one. So every rule a recipe can produce is known when its module loads, which is what makes extraction, server rendering, and generated interfaces possible. The [algebra page](/algebra) has the details.',
                  ),
                ],
              ),
              codeBlock(h, transformsSource, 'button.ts'),
            ],
          ),
        ],
      ),
      h.section(
        [...css(section, closing)],
        [
          h.div(
            [...css(closingInner)],
            [
              h.div(
                [...css(Design.stack(space[4]))],
                [
                  h.p(
                    [...css(closingText)],
                    [
                      'Pleat is the styling layer of the FACE stack: Foldkit, Alchemy, Cloudflare, Effect.',
                    ],
                  ),
                  h.p(
                    [...css(Design.muted)],
                    [
                      'This site is one: a Foldkit app rendered to static pages, styled only with Pleat, and deployed to Cloudflare by an Alchemy stack.',
                    ],
                  ),
                ],
              ),
              h.div(
                [...css(Design.row(space[4]))],
                [
                  h.a(
                    [
                      h.Href(guideRouter()),
                      ...css(Design.button({ tone: 'Primary', size: 'Large' })),
                    ],
                    ['Start the guide'],
                  ),
                  h.a(
                    [h.Href(generativeRouter()), ...css(Design.link)],
                    ['Generative interfaces'],
                  ),
                ],
              ),
            ],
          ),
        ],
      ),
    ],
  )
