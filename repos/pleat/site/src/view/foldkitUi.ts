import type { Html, HtmlBuilder } from 'foldkit/html'
import { defineView } from 'foldkit/submodel'

import { Style, When } from '@pleat/core'
import { css } from '@pleat/foldkit'

import { codeBlock } from '../code.ts'
import { Message, type Model, type TabAppearance } from '../demo/foldkitUi.ts'
import * as Design from '../design.ts'
import { buttonDemo } from '../snippet/foldkitUi/button.ts'
import buttonSource from '../snippet/foldkitUi/button.ts?raw'
import { checkboxDemo } from '../snippet/foldkitUi/checkbox.ts'
import checkboxSource from '../snippet/foldkitUi/checkbox.ts?raw'
import { comboboxDemo } from '../snippet/foldkitUi/combobox.ts'
import comboboxSource from '../snippet/foldkitUi/combobox.ts?raw'
import { dialogDemo } from '../snippet/foldkitUi/dialog.ts'
import dialogSource from '../snippet/foldkitUi/dialog.ts?raw'
import { disclosureDemo } from '../snippet/foldkitUi/disclosure.ts'
import disclosureSource from '../snippet/foldkitUi/disclosure.ts?raw'
import kitSource from '../snippet/foldkitUi/kit.ts?raw'
import { listboxDemo } from '../snippet/foldkitUi/listbox.ts'
import listboxSource from '../snippet/foldkitUi/listbox.ts?raw'
import { menuDemo } from '../snippet/foldkitUi/menu.ts'
import menuSource from '../snippet/foldkitUi/menu.ts?raw'
import { selectDemo } from '../snippet/foldkitUi/select.ts'
import selectSource from '../snippet/foldkitUi/select.ts?raw'
import { switchDemo } from '../snippet/foldkitUi/switch.ts'
import switchSource from '../snippet/foldkitUi/switch.ts?raw'
import { tabsDemo } from '../snippet/foldkitUi/tabs.ts'
import tabsSource from '../snippet/foldkitUi/tabs.ts?raw'
import { tooltipDemo } from '../snippet/foldkitUi/tooltip.ts'
import tooltipSource from '../snippet/foldkitUi/tooltip.ts?raw'
import wiringSource from '../snippet/foldkitUi/wiring.ts?raw'
import { articleStyle, pageIntro } from './guide.ts'
import { bullets, paragraph, rich, section } from './prose.ts'

const { color, font, radius, space, text } = Design.tokens

// STYLES

const stage = Style.make({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: space[4],
  minHeight: '11rem',
  padding: space[4],
  borderRadius: radius.lg,
  border: `1px solid ${color.line}`,
  backgroundColor: color.canvas,
  backgroundImage: `radial-gradient(${color.line} 1px, transparent 1px)`,
  backgroundSize: '18px 18px',
}).pipe(Style.when(When.minWidth('48rem'), { padding: space[6] }))

const stageInner = Style.make({
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  justifyContent: 'center',
  gap: space[4],
  width: '100%',
})

const tableFrame = Style.make({
  overflowX: 'auto',
  border: `1px solid ${color.line}`,
  borderRadius: radius.md,
  backgroundColor: color.surface,
})

// NOTE: the negative margin tucks the last row's border under the frame's.
const stateTable = Style.make({
  width: '100%',
  marginBottom: -1,
  borderCollapse: 'collapse',
  fontSize: text.sm,
})

const cell = Style.make({
  textAlign: 'start',
  verticalAlign: 'top',
  paddingBlock: space[2],
  paddingInline: space[3],
  borderBottom: `1px solid ${color.line}`,
})

const headCell = Style.merge(
  cell,
  Style.make({ color: color.muted, whiteSpace: 'nowrap' }),
)

const monoCell = Style.merge(
  cell,
  Style.make({ fontFamily: font.mono, fontSize: text.xs, whiteSpace: 'nowrap' }),
)

// NOTE: listings here run long, so each scrolls inside a frame of its own.
const listing = Style.make({
  maxHeight: '30rem',
  overflowY: 'auto',
  borderRadius: radius.lg,
  scrollbarColor: `${color.line} transparent`,
})

const listingView = (h: HtmlBuilder<Message>, source: string, title: string): Html =>
  h.div([...css(listing)], [codeBlock(h, source, title)])

const pickerRow = Style.make({
  display: 'flex',
  alignItems: 'center',
  gap: space[3],
  fontSize: text.sm,
  color: color.muted,
})

// STATE TABLE

const STATES: ReadonlyArray<
  readonly [condition: string, selector: string, setOn: string]
> = [
  [
    'When.open',
    '[data-open], [aria-expanded="true"]',
    'Menu, Listbox, and Combobox wrapper and trigger; Disclosure button and panel; Dialog; Tooltip trigger and panel; Popover button',
  ],
  [
    'When.highlighted',
    '[data-active]',
    'The Menu, Listbox, or Combobox item under the pointer or the arrow keys',
  ],
  [
    'When.selected',
    '[data-selected], [aria-selected="true"]',
    'Tabs tab and panel; Listbox and Combobox option',
  ],
  [
    'When.checked',
    ':checked, [data-checked], [aria-checked="true"]',
    'Switch; Checkbox; RadioGroup option',
  ],
  [
    'When.indeterminate',
    ':indeterminate, [data-indeterminate], [aria-checked="mixed"]',
    'A mixed Checkbox',
  ],
  [
    'When.disabled',
    ':disabled, [data-disabled], [aria-disabled="true"]',
    'Every component that can be disabled',
  ],
  [
    'When.invalid',
    '[data-invalid], [aria-invalid="true"]',
    'Select, Listbox, Combobox, Input',
  ],
  [
    'When.readonly',
    '[data-readonly], [aria-readonly="true"]',
    'Switch, Checkbox, Listbox, Combobox, RadioGroup',
  ],
  [
    'When.closed',
    '[data-closed]',
    'Animated panels at the start of entering and the end of leaving',
  ],
  [
    'When.transitioning',
    '[data-transition]',
    'Animated panels while they enter or leave',
  ],
  [
    'When.data("placement", side)',
    '[data-placement="top"]',
    'Anchored panels, by the side they open on',
  ],
]

const stateTableView = (h: HtmlBuilder<Message>): Html =>
  h.div(
    [...css(tableFrame)],
    [
      h.table(
        [...css(stateTable)],
        [
          h.thead(
            [],
            [
              h.tr(
                [],
                ['Condition', 'Selects', 'Foldkit UI sets it on'].map(label =>
                  h.th([...css(headCell)], [label]),
                ),
              ),
            ],
          ),
          h.tbody(
            [],
            STATES.map(([condition, selector, setOn]) =>
              h.tr(
                [],
                [
                  h.td([...css(monoCell)], [condition]),
                  h.td([...css(monoCell)], [selector]),
                  h.td([...css(cell)], [setOn]),
                ],
              ),
            ),
          ),
        ],
      ),
    ],
  )

// DEMOS

const demoSection = (
  h: HtmlBuilder<Message>,
  id: string,
  title: string,
  intro: string,
  demo: Html,
  source: string,
): Html =>
  section(h, id, title, [
    paragraph(h, intro),
    h.div(
      [h.DataAttribute('demo', id), ...css(stage)],
      [h.div([...css(stageInner)], [demo])],
    ),
    listingView(h, source, `${id}.ts`),
  ])

const APPEARANCES: ReadonlyArray<TabAppearance> = ['Underline', 'Pill']

const appearancePicker = (model: Model, h: HtmlBuilder<Message>): Html =>
  h.div(
    [...css(pickerRow)],
    [
      h.span([], ['appearance']),
      h.div(
        [h.Role('group'), h.AriaLabel('Tab appearance'), ...css(Design.segment)],
        APPEARANCES.map(appearance =>
          h.button(
            [
              h.Type('button'),
              h.AriaPressed(model.tabAppearance === appearance ? 'true' : 'false'),
              h.OnClick(Message.SelectedTabAppearance({ appearance })),
              ...css(Design.segmentButton),
            ],
            [appearance],
          ),
        ),
      ),
    ],
  )

// VIEW

/** The Foldkit UI page: live `@foldkit/ui` components styled only with Pleat. */
export const foldkitUiView = defineView<Model, Message>((model, h) =>
  h.article(
    [...css(articleStyle)],
    [
      pageIntro(
        h,
        'Foldkit UI',
        'Style @foldkit/ui with Pleat',
        'Foldkit UI handles behavior and accessibility, and describes each part’s state with data attributes. Pleat’s When conditions select those attributes, so a part’s states live in its recipe and the view only spreads attributes.',
      ),
      section(h, 'pattern', 'The pattern', [
        bullets(h, [
          '**One recipe per part.** A Menu has a trigger, a panel, and items; each gets its own style, and parts that look alike share one.',
          '**State through conditions, not the view.** A highlighted item is `When.highlighted`, an open trigger is `When.open`. The view never picks a class from the Model to show a state.',
          '**Relations for children.** A switch thumb or a chevron has no state of its own. `When.within(marker, When.checked)` moves it when the part it sits in changes.',
          '**Transitions as states.** The open look is the base, the closed look sits under `When.closed`, and the `transition` under `When.transitioning`.',
          '**Tokens and variants.** Every color, space, and radius is a theme token, so the dark theme works without a line of its own. Variants are recipe props with a Schema, like `tone` or `appearance`.',
        ]),
        paragraph(
          h,
          'The demos below share these parts. Switch to the dark theme at the top of the page to see the same styles under it.',
        ),
        listingView(h, kitSource, 'kit.ts'),
      ]),
      section(h, 'states', 'What Foldkit UI sets', [
        paragraph(
          h,
          'Each condition below was checked against the attributes `@foldkit/ui` 0.167 actually renders, and a browser test drives a Menu by keyboard to confirm the styles apply.',
        ),
        stateTableView(h),
        bullets(h, [
          'Dialog calls `show()`, not `showModal()`, so `When.backdrop` never applies. Style its `backdrop` part instead.',
          'In a RadioGroup, `data-active` marks the option holding the tab stop even when the group has no focus. Use `When.focusVisible` there.',
          'Inline styles beat classes. Foldkit UI positions floating panels inline, gives an open Menu or Listbox trigger `position: relative` and a z-index, and animates a Disclosure panel’s height inline.',
        ]),
      ]),
      demoSection(
        h,
        'button',
        'Button',
        'Button gives a button its type, tab stop, and disabled attributes. `When.disabled` outranks hover and press, so a disabled button stays still.',
        buttonDemo(model, h),
        buttonSource,
      ),
      demoSection(
        h,
        'switch',
        'Switch',
        'The track reads `When.checked`. The thumb sits inside a marked track and moves under `When.within(track, When.checked)`. `size` is a variant.',
        switchDemo(model, h),
        switchSource,
      ),
      demoSection(
        h,
        'checkbox',
        'Checkbox',
        'A parent checkbox is mixed while some of its steps are done. Foldkit UI marks that with `data-indeterminate` and `aria-checked="mixed"`, which `When.indeterminate` selects.',
        checkboxDemo(model, h),
        checkboxSource,
      ),
      demoSection(
        h,
        'disclosure',
        'Disclosure',
        'The button and panel get `data-open`. The chevron is the shared one: it turns inside any open trigger.',
        disclosureDemo(model, h),
        disclosureSource,
      ),
      section(h, 'tabs', 'Tabs', [
        paragraph(
          h,
          'The selected tab and its panel get `data-selected`. Both the list and the tabs take an `appearance` variant, and the Model holds the choice as a Schema literal.',
        ),
        h.div(
          [h.DataAttribute('demo', 'tabs'), ...css(stage)],
          [appearancePicker(model, h), h.div([...css(stageInner)], [tabsDemo(model, h)])],
        ),
        listingView(h, tabsSource, 'tabs.ts'),
      ]),
      demoSection(
        h,
        'select',
        'Select',
        'Select wraps the native element. An empty choice is invalid, which sets `data-invalid` and `aria-invalid`; the second select is disabled through the native property.',
        selectDemo(model, h),
        selectSource,
      ),
      demoSection(
        h,
        'listbox',
        'Listbox',
        'A custom select. Options get `data-active` while highlighted and `data-selected` when chosen, and the check mark appears through `When.within(option, When.selected)`. Margaret is disabled.',
        listboxDemo(model, h),
        listboxSource,
      ),
      demoSection(
        h,
        'combobox',
        'Combobox',
        'Type to filter. The panel is the same one Menu and Listbox use, with the same enter and leave transition.',
        comboboxDemo(model, h),
        comboboxSource,
      ),
      demoSection(
        h,
        'menu',
        'Menu',
        'Open it with the mouse or with Enter, then move with the arrow keys. Menu takes class names rather than attributes, so its parts use `cssClass`. Share is disabled, and Delete takes the `Danger` tone.',
        menuDemo(model, h),
        menuSource,
      ),
      demoSection(
        h,
        'dialog',
        'Dialog',
        'The backdrop and the panel share the transition states. The dialog lays itself out only under `When.open`, since a closed dialog is hidden by the browser’s own stylesheet.',
        dialogDemo(model, h),
        dialogSource,
      ),
      demoSection(
        h,
        'tooltip',
        'Tooltip',
        'Hover or focus the button. Tooltip has no transition states, so its panel plays a keyframe animation when it mounts.',
        tooltipDemo(model, h),
        tooltipSource,
      ),
      section(h, 'wiring', 'Wire it into your app', [
        paragraph(
          h,
          'Stateful components are Submodels: a field in your Model, a message that wraps theirs, `Update.foldChild` in update, and `h.submodel` in the view. Pleat appears only in the view.',
        ),
        listingView(h, wiringSource, 'wiring.ts'),
        h.p(
          [...css(Design.body, Design.muted, Design.small)],
          rich(
            h,
            '`Menu.create` returns a bundle that TypeScript can’t name across files without an annotation, so the example gives it one: `Menu.Bundle<Action>`.',
          ),
        ),
      ]),
    ],
  ),
)
