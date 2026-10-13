import type { Html, HtmlBuilder } from 'foldkit/html'

import { Recipe, Style, When } from '@pleat/core'
import { css } from '@pleat/foldkit'

import {
  Message,
  type Model,
  Section,
  SectionTabs,
} from '../../demo/foldkitUi.ts'
import { focusRing, tokens } from '../../design.ts'

const { color, radius, space, text } = tokens

// PARTS

// appearance is a Schema-typed prop: the Model holds a TabAppearance, and
// tab.schema would reject anything else.
const tabList = Recipe.make({
  name: 'TabList',
  base: Style.make({
    display: 'flex',
    gap: space[1],
    overflowX: 'auto',
  }),
  variants: {
    appearance: {
      Underline: { borderBottom: `1px solid ${color.line}` },
      Pill: {
        padding: 3,
        borderRadius: radius.md,
        backgroundColor: color.sunken,
        border: `1px solid ${color.line}`,
      },
    },
  },
})

const tab = Recipe.make({
  name: 'Tab',
  base: Style.make({
    paddingBlock: space[2],
    paddingInline: space[3],
    border: 'none',
    backgroundColor: 'transparent',
    color: color.muted,
    fontFamily: 'inherit',
    fontSize: text.sm,
    fontWeight: 500,
    whiteSpace: 'nowrap',
    cursor: 'pointer',
  }).pipe(
    Style.merge(focusRing),
    Style.when(When.hover, { color: color.ink }),
    Style.when(When.disabled, {
      opacity: 0.45,
      cursor: 'not-allowed',
    }),
  ),
  variants: {
    appearance: {
      Underline: Style.make({
        marginBottom: -1,
        borderBottom: '2px solid transparent',
      }).pipe(
        Style.when(When.selected, {
          color: color.ink,
          borderBottomColor: color.accent,
        }),
      ),
      Pill: Style.make({ borderRadius: 6 }).pipe(
        Style.when(When.selected, {
          color: color.ink,
          backgroundColor: color.surface,
          boxShadow: `0 1px 2px ${color.line}`,
        }),
      ),
    },
  },
})

const tabPanel = Style.make({
  paddingBlock: space[4],
  fontSize: text.sm,
  color: color.muted,
}).pipe(Style.merge(focusRing))

// VIEW

const PANELS: Readonly<Record<Section, string>> = {
  Pattern:
    'Six pieces, cut on the grain. Seam allowance is 1.5 cm throughout.',
  Fabric:
    'Mid-weight linen or chambray, about 2.2 m at 140 cm wide.',
  Notions:
    'Seven buttons, interfacing for the placket, and matching thread.',
  History: 'No revisions yet.',
}

export const tabsDemo = (
  model: Model,
  h: HtmlBuilder<Message>,
): Html =>
  h.submodel({
    slotId: 'ui-tabs',
    model: model.tabs,
    view: SectionTabs.view,
    toParentMessage: message => Message.GotTabsMessage({ message }),
    viewInputs: {
      tabs: Section.literals,
      selectedValue: model.section,
      ariaLabel: 'Pattern details',
      isTabDisabled: section => section === 'History',
      toView: ({ tablist, tabs, activeIndex }) => {
        const appearance = model.tabAppearance
        return h.div(
          [],
          [
            h.div(
              [...tablist, ...css(tabList({ appearance }))],
              tabs.map(info =>
                h.button(
                  [...info.tab, ...css(tab({ appearance }))],
                  [info.value],
                ),
              ),
            ),
            ...tabs
              .filter(info => info.index === activeIndex)
              .map(info =>
                h.div(
                  [...info.panel, ...css(tabPanel)],
                  [PANELS[info.value]],
                ),
              ),
          ],
        )
      },
    },
  })
