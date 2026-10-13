import type { Html, HtmlBuilder } from 'foldkit/html'

import { Button } from '@foldkit/ui'
import { css } from '@pleat/foldkit'

import { Message, type Model } from '../../demo/foldkitUi.ts'
import { cluster, uiButton } from './kit.ts'

export const buttonDemo = (
  model: Model,
  h: HtmlBuilder<Message>,
): Html =>
  h.div(
    [...css(cluster)],
    [
      Button.view(
        {
          onClick: Message.ClickedSave(),
          toView: ({ button }) =>
            h.button(
              [
                ...button,
                ...css(
                  uiButton({ tone: 'Primary', size: 'Medium' }),
                ),
              ],
              [`Save (${model.saveCount})`],
            ),
        },
        h,
      ),
      Button.view(
        {
          onClick: Message.ClickedSave(),
          toView: ({ button }) =>
            h.button(
              [...button, ...css(uiButton({ size: 'Medium' }))],
              ['Save a copy'],
            ),
        },
        h,
      ),
      // isDisabled sets data-disabled and aria-disabled, and drops onClick.
      Button.view(
        {
          isDisabled: true,
          toView: ({ button }) =>
            h.button(
              [
                ...button,
                ...css(
                  uiButton({ tone: 'Primary', size: 'Medium' }),
                ),
              ],
              ['Publish'],
            ),
        },
        h,
      ),
    ],
  )
