import type { Html, HtmlBuilder } from 'foldkit/html'

import { Dialog } from '@foldkit/ui'
import { Style, When } from '@pleat/core'
import { css } from '@pleat/foldkit'

import { Message, type Model } from '../../demo/foldkitUi.ts'
import { tokens } from '../../design.ts'
import { cluster, hint, uiButton } from './kit.ts'

const { color, font, radius, shadow, space, text } = tokens

// PARTS

// A closed <dialog> is hidden by the browser's own stylesheet, which any
// author rule beats, so the layout applies only once Foldkit UI sets data-open.
const dialogRoot = Style.empty.pipe(
  Style.when(When.open, {
    display: 'grid',
    placeItems: 'center',
    padding: space[4],
  }),
)

const fade = When.all(When.motionSafe, When.transitioning)

// Foldkit UI calls show(), not showModal(), so there is no ::backdrop. The
// backdrop is an element of its own, with the same transition states as the panel.
const dialogBackdrop = Style.make({
  position: 'fixed',
  inset: 0,
  // A scrim darkens in either theme, so it is the one color here that is not a token.
  backgroundColor: 'oklch(18% 0.02 272 / 0.5)',
}).pipe(
  Style.when(fade, { transition: 'opacity 200ms ease' }),
  Style.when(When.closed, { opacity: 0 }),
)

const dialogPanel = Style.make({
  position: 'relative',
  display: 'flex',
  flexDirection: 'column',
  gap: space[3],
  width: '100%',
  maxWidth: '26rem',
  padding: space[5],
  borderRadius: radius.lg,
  border: `1px solid ${color.line}`,
  backgroundColor: color.surface,
  color: color.ink,
  boxShadow: shadow.raised,
}).pipe(
  Style.when(fade, {
    transition:
      'opacity 200ms ease, translate 200ms ease, scale 200ms ease',
  }),
  Style.when(When.closed, {
    opacity: 0,
    translate: '0 8px',
    scale: '0.97',
  }),
)

const dialogTitle = Style.make({
  fontFamily: font.sans,
  fontSize: text.xl,
  fontWeight: 600,
})

const dialogText = Style.make({
  fontSize: text.sm,
  color: color.muted,
})

const dialogActions = Style.merge(
  cluster,
  Style.make({ justifyContent: 'flex-end' }),
)

// VIEW

export const dialogDemo = (
  model: Model,
  h: HtmlBuilder<Message>,
): Html =>
  h.div(
    [...css(cluster)],
    [
      model.isPatternArchived
        ? h.button(
            [
              h.Type('button'),
              h.OnClick(Message.ClickedRestore()),
              ...css(uiButton({})),
            ],
            ['Restore pattern'],
          )
        : h.button(
            [
              h.Type('button'),
              h.OnClick(Message.ClickedArchivePrompt()),
              ...css(uiButton({})),
            ],
            ['Archive pattern…'],
          ),
      h.span(
        [...css(hint)],
        [model.isPatternArchived ? 'Archived.' : 'Not archived.'],
      ),
      h.submodel({
        slotId: 'ui-dialog',
        model: model.dialog,
        view: Dialog.view,
        toParentMessage: message =>
          Message.GotDialogMessage({ message }),
        viewInputs: {
          hasDescription: true,
          toView: ({
            dialog,
            backdrop,
            panel,
            title,
            description,
            closeButton,
            initialFocus,
          }) =>
            h.dialog(
              [...dialog, ...css(dialogRoot)],
              [
                h.div([...backdrop, ...css(dialogBackdrop)]),
                h.div(
                  [...panel, ...css(dialogPanel)],
                  [
                    h.h2(
                      [...title, ...css(dialogTitle)],
                      ['Archive this pattern?'],
                    ),
                    h.p(
                      [...description, ...css(dialogText)],
                      [
                        'It leaves your library, and anyone it was shared with loses access.',
                      ],
                    ),
                    h.div(
                      [...css(dialogActions)],
                      [
                        h.button(
                          [
                            ...closeButton,
                            ...initialFocus,
                            ...css(uiButton({ size: 'Medium' })),
                          ],
                          ['Keep it'],
                        ),
                        h.button(
                          [
                            h.Type('button'),
                            h.OnClick(Message.ClickedArchive()),
                            ...css(
                              uiButton({
                                tone: 'Primary',
                                size: 'Medium',
                              }),
                            ),
                          ],
                          ['Archive'],
                        ),
                      ],
                    ),
                  ],
                ),
              ],
            ),
        },
      }),
    ],
  )
