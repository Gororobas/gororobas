import type { Html, HtmlBuilder } from 'foldkit/html'

import { Color, Global, Style, When } from '@pleat/core'
import { css } from '@pleat/foldkit'

import * as Design from '../design.ts'

const { color } = Design.tokens

/** How many faces the pleat has. Each is one element and a few conditions. */
export const FACE_COUNT = 36

// NOTE: the pleat is pure CSS. Each face is one element. Hovering a face opens
// it and, through a sibling condition, every face after it in the DOM, which
// is every face to its left because the strip is laid out in reverse. Faces to
// the right keep their geometry, so the face under the pointer never slides
// out from under it, and the strip settles instead of jittering.

const face = When.marker('pleat-face')

const EASE = 'cubic-bezier(0.2, 0.75, 0.2, 1)'

// NOTE: each face is a trapezoid. The tall edge is the ridge nearest the
// viewer; the short edge is the valley. Odd faces ridge on the left and catch
// the light; even faces ridge on the right and turn away from it.
const ridgeLeft = (notch: string): string =>
  `polygon(0 0, 100% ${notch}, 100% calc(100% - ${notch}), 0 100%)`
const ridgeRight = (notch: string): string =>
  `polygon(0 ${notch}, 100% 0, 100% 100%, 0 calc(100% - ${notch}))`

const NOTCH = '8%'
const NOTCH_OPEN = '1.5%'

const drape =
  'linear-gradient(180deg, rgb(255 255 255 / 0.12), transparent 38%, transparent 66%, rgb(0 0 0 / 0.2))'
const litFace =
  'linear-gradient(90deg, rgb(255 255 255 / 0.5), rgb(255 255 255 / 0.1) 55%, rgb(0 0 0 / 0.06))'
const shadeFace =
  'linear-gradient(90deg, rgb(0 0 0 / 0.5), rgb(0 0 0 / 0.22) 45%, rgb(0 0 0 / 0.08))'

const glint = Global.keyframes('pleat-glint', {
  '0%': { opacity: 0 },
  '6%': { opacity: 0.26 },
  '14%': { opacity: 0 },
  '100%': { opacity: 0 },
})

const opened = Style.make({
  width: `calc(100% / ${FACE_COUNT} * 2.5)`,
  clipPath: ridgeLeft(NOTCH_OPEN),
})

const openedBy = When.precededBy(face, When.hover)

const faceStyle = Style.make({
  position: 'relative',
  flex: '0 0 auto',
  width: `calc(100% / ${FACE_COUNT})`,
  height: '100%',
  backgroundColor: color.brand,
  clipPath: ridgeLeft(NOTCH),
}).pipe(
  Style.merge(Style.mark(face)),
  Style.when(When.before, {
    content: '""',
    position: 'absolute',
    inset: 0,
    pointerEvents: 'none',
    backgroundImage: `${drape}, ${litFace}`,
  }),
  Style.when(When.after, {
    content: '""',
    position: 'absolute',
    inset: 0,
    pointerEvents: 'none',
    backgroundColor: 'white',
    opacity: 0,
  }),
  Style.when(When.even, { clipPath: ridgeRight(NOTCH) }),
  Style.when(When.all(When.even, When.before), {
    backgroundImage: `${drape}, ${shadeFace}`,
  }),
  Style.when(When.motionSafe, {
    transition: `width 650ms ${EASE}, clip-path 650ms ${EASE}`,
  }),
  Style.when(When.all(When.motionSafe, When.before), {
    transition: `opacity 650ms ${EASE}`,
  }),
  Style.when(When.all(When.motionSafe, When.after), {
    animation: `${glint} 9s ease-in-out infinite`,
  }),
  Style.when(When.hover, opened),
  Style.when(openedBy, opened),
  Style.when(When.all(When.even, When.hover), { clipPath: ridgeRight(NOTCH_OPEN) }),
  Style.when(When.all(When.even, openedBy), { clipPath: ridgeRight(NOTCH_OPEN) }),
  Style.when(When.all(When.hover, When.before), { opacity: 0.42 }),
  Style.when(When.all(openedBy, When.before), { opacity: 0.42 }),
)

// NOTE: the glint sweeps left to right, so the last face in the DOM, the
// leftmost one, lights first.
const delays: ReadonlyArray<Style.Style> = Array.from(
  { length: FACE_COUNT },
  (_, index) =>
    Style.empty.pipe(
      Style.when(When.after, { animationDelay: `${(FACE_COUNT - 1 - index) * 90}ms` }),
    ),
)

const strip = Style.make({
  position: 'relative',
  display: 'flex',
  flexDirection: 'row-reverse',
  justifyContent: 'flex-start',
  alignItems: 'stretch',
  width: '100%',
  overflow: 'hidden',
  filter: `drop-shadow(0 24px 24px ${Color.alpha(color.ink, 0.2)})`,
})

const heights = {
  Hero: Style.make({ height: 'clamp(12rem, 30vw, 25rem)' }),
  Small: Style.make({ height: 'clamp(7rem, 16vw, 10rem)' }),
} as const

export type PleatSize = keyof typeof heights

/** The pleat: a strip of faces that opens under the pointer. Decorative. */
export const pleatView = <Message>(
  h: HtmlBuilder<Message>,
  size: PleatSize = 'Hero',
): Html =>
  h.div(
    [h.AriaHidden(true), ...css(strip, heights[size])],
    delays.map(delay => h.div([...css(faceStyle, delay)])),
  )
