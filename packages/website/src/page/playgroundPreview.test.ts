import { type HtmlBuilder, inertHtml as ih } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import {
  type SceneSimulation,
  expect,
  given,
  scene,
  selector,
  text,
} from 'foldkit/scene'
import { describe, expect as expectValue, test } from 'vitest'

import * as PlaygroundPreview from './playgroundPreview'

const PREVIEW_URL = 'https://preview.example.test'
const STALE_PREVIEW_URL = 'https://stale.example.test'
const preview = selector('iframe')
const Message = defineMessageUnion({ LoadedPreview: {} })

const previewApp = {
  update: (
    state: typeof PlaygroundPreview.State.Type,
    _message: typeof Message.Type,
  ) => ({
    model: state,
  }),
  view: (
    state: typeof PlaygroundPreview.State.Type,
    h: HtmlBuilder<typeof Message.Type>,
  ) =>
    PlaygroundPreview.view(
      state,
      Message.LoadedPreview(),
      ih.div([], ['Preparing preview…']),
      h,
    ),
}

const expectPreviewKey =
  (expectedKey: string) =>
  (
    simulation: SceneSimulation<
      typeof PlaygroundPreview.State.Type,
      typeof Message.Type
    >,
  ) => {
    const frame = simulation.html.children?.find(
      child => typeof child !== 'string' && child.sel === 'iframe',
    )
    if (frame === undefined || typeof frame === 'string') {
      throw new Error('The preview iframe was not rendered')
    } else {
      expectValue(frame.key).toBe(expectedKey)
      return simulation
    }
  }

describe('playground preview', () => {
  test('loads only the current preview', () => {
    const loading = PlaygroundPreview.start(PREVIEW_URL)
    const loaded = PlaygroundPreview.load(loading, PREVIEW_URL)
    expectValue(PlaygroundPreview.load(loading, STALE_PREVIEW_URL)).toBe(
      loading,
    )
    expectValue(loaded).toEqual(
      PlaygroundPreview.State.Loaded({ previewUrl: PREVIEW_URL }),
    )
    expectValue(PlaygroundPreview.load(loaded, PREVIEW_URL)).toBe(loaded)
  })

  test('keeps a loading frame out of reach', () => {
    scene(
      previewApp,
      given(PlaygroundPreview.start(PREVIEW_URL)),
      expect(preview).toHaveHandler('load'),
      expect(preview).toHaveAttr('inert', 'true'),
      expect(preview).toHaveAttr('aria-hidden', 'true'),
      expect(preview).toHaveAttr('tabIndex', '-1'),
      expect(preview).toHaveClass('invisible'),
      expect(preview).toHaveClass('pointer-events-none'),
      expect(text('Preparing preview…')).toExist(),
      expectPreviewKey(PREVIEW_URL),
    )
  })

  test('reveals a loaded frame', () => {
    scene(
      previewApp,
      given(PlaygroundPreview.State.Loaded({ previewUrl: PREVIEW_URL })),
      expect(preview).toHaveAttr('inert', 'false'),
      expect(preview).toHaveAttr('aria-hidden', 'false'),
      expect(preview).toHaveAttr('tabIndex', '0'),
      expect(preview).toHaveClass('opacity-100'),
      expect(selector('.hidden')).toContainText('Preparing preview…'),
      expectPreviewKey(PREVIEW_URL),
    )
  })

  test('keys a different preview URL as a different frame', () => {
    scene(
      previewApp,
      given(PlaygroundPreview.start(STALE_PREVIEW_URL)),
      expectPreviewKey(STALE_PREVIEW_URL),
    )
  })
})
