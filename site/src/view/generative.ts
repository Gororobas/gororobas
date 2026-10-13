import { Cause, Exit, Option, Schema } from 'effect'
import type { Html, HtmlBuilder } from 'foldkit/html'

import { Style, When } from '@pleat/core'
import { css } from '@pleat/foldkit'

import { codeBlock } from '../code.ts'
import { CardSpec, surface } from '../demo/card.ts'
import cardSource from '../demo/card.ts?raw'
import * as Design from '../design.ts'
import { Message, type Model, type Preset } from '../message.ts'
import generativeSource from '../snippet/generative.ts?raw'
import { articleStyle, pageIntro } from './guide.ts'
import { bullets, onThisPage, paragraph, section } from './prose.ts'

const { color, font, radius, space, text } = Design.tokens

// STYLES

const workbench = Style.merge(
  Design.card,
  Style.make({
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr)',
    gap: space[5],
    padding: space[5],
  }),
).pipe(
  Style.when(When.minWidth('60rem'), {
    gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
  }),
)

const editor = Style.make({
  width: '100%',
  minHeight: 300,
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

const label = Style.make({ fontFamily: font.mono, fontSize: text.xs, color: color.muted })

const result = Style.make({ display: 'flex', flexDirection: 'column', gap: space[3] })

const cardTitle = Style.make({
  fontFamily: font.sans,
  fontSize: text.xl,
  lineHeight: 1.2,
})

const cardBody = Style.make({ opacity: 0.85, textWrap: 'pretty' })

const problem = Style.make({
  display: 'flex',
  flexDirection: 'column',
  gap: space[2],
  padding: space[4],
  borderRadius: radius.md,
  border: `1px solid ${color.accent}`,
  backgroundColor: color.accentSoft,
})

const problemText = Style.make({
  margin: 0,
  fontFamily: font.mono,
  fontSize: text.xs,
  whiteSpace: 'pre-wrap',
  overflowWrap: 'anywhere',
})

// DECODING

type Decoded =
  | Readonly<{ _tag: 'Card'; card: CardSpec }>
  | Readonly<{ _tag: 'Problem'; message: string }>

const decodeCard = Schema.decodeUnknownExit(CardSpec)

const problemMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)

const decodeSource = (source: string): Decoded => {
  let parsed: unknown
  try {
    parsed = JSON.parse(source)
  } catch (error) {
    return {
      _tag: 'Problem',
      message: `Not JSON: ${error instanceof Error ? error.message : String(error)}`,
    }
  }
  const exit = decodeCard(parsed)
  return Exit.isSuccess(exit)
    ? { _tag: 'Card', card: exit.value }
    : { _tag: 'Problem', message: problemMessage(Cause.squash(exit.cause)) }
}

// VIEW

const PRESETS: ReadonlyArray<readonly [Preset, string]> = [
  ['Valid', 'A good answer'],
  ['UnknownTone', 'An option that does not exist'],
  ['Injection', 'A CSS injection attempt'],
  ['Overlong', 'Too long, wrong tone'],
]

const cardView = (card: CardSpec, h: HtmlBuilder<Message>): Html =>
  h.article(
    [...css(surface(card.surface))],
    [
      h.h3([...css(cardTitle)], [card.title]),
      h.p([...css(cardBody)], [card.body]),
      ...(card.action === undefined
        ? []
        : [
            h.div(
              [],
              [
                h.button(
                  [
                    h.Type('button'),
                    ...css(
                      Design.button({
                        tone: card.action.tone ?? 'Neutral',
                        size: 'Small',
                      }),
                    ),
                  ],
                  [card.action.label],
                ),
              ],
            ),
          ]),
    ],
  )

const resultView = (source: string, h: HtmlBuilder<Message>): Html => {
  const decoded = decodeSource(source)
  return decoded._tag === 'Card'
    ? h.div(
        [...css(result)],
        [h.span([...css(label)], ['Decoded and rendered']), cardView(decoded.card, h)],
      )
    : h.div(
        [...css(result)],
        [
          h.span([...css(label)], ['Rejected before it reached the view']),
          h.div(
            [h.Role('status'), ...css(problem)],
            [h.pre([...css(problemText)], [decoded.message])],
          ),
        ],
      )
}

const workbenchView = (model: Model, h: HtmlBuilder<Message>): Html =>
  h.div(
    [...css(Design.stack(space[4]))],
    [
      h.div(
        [
          h.Role('group'),
          h.AriaLabel('Example model output'),
          ...css(Design.row(space[2])),
        ],
        PRESETS.map(([preset, title]) =>
          h.button(
            [
              h.Type('button'),
              h.AriaPressed(Option.contains(model.preset, preset) ? 'true' : 'false'),
              h.OnClick(Message.ClickedPreset({ preset })),
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
              h.span([...css(label)], ['Model output (editable)']),
              h.textarea([
                h.Value(model.specSource),
                h.Spellcheck(false),
                h.OnInput(source => Message.UpdatedSpec({ source })),
                ...css(editor),
              ]),
            ],
          ),
          resultView(model.specSource, h),
        ],
      ),
    ],
  )

const CONTENTS: ReadonlyArray<readonly [id: string, title: string]> = [
  ['closed-world', 'Closed-world styling'],
  ['schema', 'Describe the menu'],
  ['ask', 'Ask a model'],
  ['try', 'Try it'],
]

export const generativeView = (model: Model, h: HtmlBuilder<Message>): Html =>
  h.article(
    [...css(articleStyle)],
    [
      onThisPage(h, CONTENTS),
      pageIntro(
        h,
        'Generative interfaces',
        'Let a model choose, never write, your styles',
        'When a language model builds part of your interface, give it a typed menu. Pleat recipes describe their props with Schema, so the model picks among styles that are already compiled, and its answer is decoded before it reaches a view.',
      ),
      section(h, 'closed-world', 'Closed-world styling', [
        paragraph(
          h,
          'A model that writes CSS or utility classes can produce anything: rules your stylesheet never shipped, values that break the layout, or text that escapes a declaration. A model that fills in recipe props can only produce combinations that were compiled when the page loaded.',
        ),
        bullets(h, [
          'Every option a model can name already has rules, so generated UI needs no build step and no runtime CSS from model output.',
          'Props are Effect Schemas, and `Recipe.jsonSchema` gives the JSON Schema for structured output and tool calls.',
          'Descriptions on recipes and dimensions travel into the JSON Schema, so the model reads your design guidance next to the options.',
          'Theme values are checked by their token kinds, so a generated theme can only contain colors, lengths, and durations.',
        ]),
      ]),
      section(h, 'schema', 'Describe the menu', [
        paragraph(
          h,
          'Compose recipe schemas into the shape you want back. Here a card has content plus props for two recipes: its surface, and a button for its action.',
        ),
        codeBlock(h, cardSource, 'card.ts'),
      ]),
      section(h, 'ask', 'Ask a model', [
        paragraph(
          h,
          '`effect/ai` turns the schema into structured output for any provider and decodes the answer. The same schema decodes output from anywhere else, such as a stream or a cache.',
        ),
        codeBlock(h, generativeSource, 'generate.ts'),
      ]),
      section(h, 'try', 'Try it', [
        paragraph(
          h,
          'The text below stands in for a model’s answer. Edit it, or pick an example. The view decodes it with `CardSpec` on every change and renders the card with the `surface` and `button` recipes.',
        ),
      ]),
      h.div([], [workbenchView(model, h)]),
    ],
  )
