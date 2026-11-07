import type { SupportedLanguage } from "@gororobas/domain/common/enums"
import { BookmarkState } from "@gororobas/domain/common/enums"
import { msg } from "@lingui/core/macro"
import { Style, When } from "@pleat/core"
import { HashMap, Option } from "effect"
import type { Html } from "foldkit/html"

import { loginUrl } from "../../../app/route"
import { type Translator, translateLabels, translatorFor } from "../../../lib/translations"
import { bookmarkVocabularies } from "../../../lib/vocabulary"
import { AppText } from "../../../ui/app-text"
import * as Icons from "../../../ui/icons"
import { bookmarkStateIcon } from "../../../ui/icons/bookmark-icons"
import { styledAttributes, styledClassName } from "../../../ui/pleat-attributes"
import { focusRingDeclarations } from "../../../ui/styles/focus-ring"
import {
  borderWidth,
  controlSize,
  duration,
  easing,
  fontSize,
  fontWeight,
  radius,
  space,
  toneColors,
  tones,
} from "../../../ui/theme"
import { BookmarkPickerBinding, type WikiArticleViewBuilder } from "../composition"
import { Message } from "../message"
import { BookmarkSaving, type Model } from "../model"
import type { Page } from "./shared"

const triggerMarker = When.marker("bookmark-trigger")

const pickerStyle = Style.make({ display: "grid", rowGap: space[2] })

const triggerStyle = Style.make({
  display: "flex",
  alignItems: "center",
  gap: space[3],
  inlineSize: "100%",
  blockSize: controlSize.lg,
  paddingInlineStart: space[4],
  paddingInlineEnd: space[1],
  border: `${borderWidth.strong} solid ${tones.neutral.ramp[600]}`,
  borderRadius: radius.full,
  cornerShape: "squircle",
  backgroundColor: tones.primary.ramp[400],
  color: tones.neutral.ramp[900],
  fontSize: fontSize.regular,
  fontWeight: fontWeight.medium,
  textAlign: "start",
  cursor: "pointer",
  outline: "none",
  transitionProperty: "filter",
  transitionDuration: duration.control,
}).pipe(
  Style.merge(Style.mark(triggerMarker)),
  Style.when(When.hover, { filter: "brightness(0.97)" }),
  Style.when(When.focusVisible, focusRingDeclarations),
  Style.when(When.disabled, { cursor: "progress", opacity: 0.7 }),
)

const triggerLabelStyle = Style.make({
  flex: 1,
  minInlineSize: 0,
  overflow: "hidden",
  whiteSpace: "nowrap",
  textOverflow: "ellipsis",
})

/** The arrow sits in its own round well, and turns over while the choices are open. */
const chevronWellStyle = Style.make({
  display: "grid",
  placeItems: "center",
  flexShrink: 0,
  inlineSize: `calc(${controlSize.lg} - ${space[3]})`,
  aspectRatio: "1",
  borderRadius: radius.full,
  backgroundColor: tones.primary.ramp[500],
  transitionProperty: "transform, background-color",
  transitionDuration: duration.moderate,
  transitionTimingFunction: easing.emphasized,
}).pipe(
  Style.when(When.within(triggerMarker, When.hover), {
    backgroundColor: tones.primary.ramp[600],
  }),
  Style.when(When.within(triggerMarker, When.aria("expanded", "true")), {
    transform: "rotate(180deg)",
  }),
  Style.when(When.reducedMotion, { transitionDuration: "0s" }),
)

const bookmarkPanelStyle = Style.make({
  rowGap: space[1],
  padding: space[2],
  inlineSize: "min(20rem, calc(100vw - 2rem))",
})

const optionListStyle = Style.make({ display: "grid", rowGap: space[1] })

const optionStyle = Style.make({
  display: "flex",
  alignItems: "center",
  gap: space[3],
  inlineSize: "100%",
  minBlockSize: controlSize.lg,
  paddingInline: space[3],
  borderRadius: radius.full,
  cornerShape: "squircle",
  color: toneColors.foreground,
  fontSize: fontSize.regular,
  textAlign: "start",
  cursor: "pointer",
  outline: "none",
  transitionProperty: "background-color",
  transitionDuration: duration.control,
}).pipe(
  Style.when(When.hover, { backgroundColor: toneColors.hover }),
  Style.when(When.focusVisible, focusRingDeclarations),
  Style.when(When.disabled, { cursor: "progress", opacity: 0.6 }),
)

const selectedOptionStyle = Style.make({
  backgroundColor: tones.primary.ramp[400],
  fontWeight: fontWeight.semibold,
}).pipe(Style.when(When.hover, { backgroundColor: tones.primary.ramp[400] }))

const removeOptionStyle = Style.make({ color: tones.neutral.shade[700] })

const optionLabelStyle = Style.make({ flex: 1 })

const separatorStyle = Style.make({
  blockSize: borderWidth.hairline,
  marginBlock: space[1],
  marginInline: space[3],
  border: "none",
  backgroundColor: toneColors.border,
})

const signInLinkStyle = Style.make({
  display: "flex",
  alignItems: "center",
  gap: space[2],
  blockSize: controlSize.lg,
  paddingInline: space[4],
  borderRadius: radius.full,
  cornerShape: "squircle",
  backgroundColor: tones.primary.ramp[400],
  color: tones.neutral.ramp[900],
  outline: "none",
}).pipe(Style.when(When.focusVisible, focusRingDeclarations))

type PickerState = Readonly<{
  page: Page
  i18n: Translator
  /** Each state in the article kind's own words. */
  states: Readonly<Record<BookmarkState, string>>
  maybeState: Option.Option<BookmarkState>
  isSaving: boolean
}>

const triggerContent = (
  { page, i18n, states, maybeState }: PickerState,
  h: WikiArticleViewBuilder,
): ReadonlyArray<Html> => [
  Option.match(maybeState, {
    onNone: () => Icons.bookmark({ size: "md" }),
    onSome: (state) => bookmarkStateIcon(page.kind, state)({ size: "md" }),
  }),
  h.span(styledAttributes([], triggerLabelStyle), [
    Option.match(maybeState, {
      onNone: () => i18n._(msg`Save to my list`),
      onSome: (state) => states[state],
    }),
  ]),
  h.span(styledAttributes([h.AriaHidden(true)], chevronWellStyle), [
    Icons.chevronDown({ size: "sm" }),
  ]),
]

/** Each state in the kind's own words, then a way out of the list once saved. */
const options = (state: PickerState, h: WikiArticleViewBuilder): Html =>
  h.div(
    styledAttributes(
      [h.Role("group"), h.AriaLabel(state.i18n._(msg`Your relationship to this article`))],
      optionListStyle,
    ),
    [
      ...BookmarkState.literals.map((bookmarkState) => {
        const isSelected = Option.contains(state.maybeState, bookmarkState)

        return h.keyed("button")(
          bookmarkState,
          styledAttributes(
            [
              h.Type("button"),
              h.AriaPressed(String(isSelected)),
              h.Disabled(state.isSaving),
              h.OnClick(
                Message.SelectedBookmarkState({
                  maybeState: isSelected ? Option.none() : Option.some(bookmarkState),
                }),
              ),
            ],
            optionStyle,
            ...(isSelected ? [selectedOptionStyle] : []),
          ),
          [
            bookmarkStateIcon(state.page.kind, bookmarkState)({ mode: "outline", size: "md" }),
            h.span(styledAttributes([], optionLabelStyle), [state.states[bookmarkState]]),
            ...(isSelected ? [Icons.check({ mode: "outline", size: "sm", tone: "accent" })] : []),
          ],
        )
      }),
      ...(Option.isSome(state.maybeState)
        ? [
            h.hr(styledAttributes([h.AriaHidden(true)], separatorStyle)),
            h.button(
              styledAttributes(
                [
                  h.Type("button"),
                  h.Disabled(state.isSaving),
                  h.OnClick(Message.SelectedBookmarkState({ maybeState: Option.none() })),
                ],
                optionStyle,
                removeOptionStyle,
              ),
              [
                Icons.bookmarkX({ mode: "outline", size: "md" }),
                h.span(styledAttributes([], optionLabelStyle), [
                  state.i18n._(msg`Remove from my list`),
                ]),
              ],
            ),
          ]
        : []),
    ],
  )

/** Someone's own relationship to the article, chosen in a popover or a drawer. */
export const view = (
  {
    model,
    language,
    page,
    isSignedIn,
  }: Readonly<{ model: Model; language: SupportedLanguage; page: Page; isSignedIn: boolean }>,
  h: WikiArticleViewBuilder,
): Html => {
  const i18n = translatorFor(language)
  const states = translateLabels(i18n, bookmarkVocabularies[page.kind].states)

  if (!isSignedIn) {
    const interested = states.INTERESTED

    return h.a(styledAttributes([h.Href(loginUrl(language))], signInLinkStyle), [
      Icons.bookmark({ size: "md" }),
      i18n._(msg`${interested}? Sign in to save`),
    ])
  }

  const state: PickerState = {
    page,
    i18n,
    states,
    maybeState: HashMap.get(model.viewerBookmarks, page.id),
    isSaving: BookmarkSaving.guards.Saving(model.bookmarkSaving),
  }

  return h.div(styledAttributes([], pickerStyle), [
    h.block(
      BookmarkPickerBinding.embedView({
        slotId: model.bookmarkPicker.id,
        model: model.bookmarkPicker,
        viewInputs: {
          title: i18n._(msg`Save to my list`),
          trigger: {
            children: triggerContent(state, h),
            className: styledClassName(triggerStyle),
            isDisabled: state.isSaving,
          },
          toContent: () => [options(state, h)],
          panelClassName: styledClassName(bookmarkPanelStyle),
          tone: "primary",
        },
      }),
    ),
    ...(BookmarkSaving.guards.Failed(model.bookmarkSaving)
      ? [
          AppText.view(
            {
              element: "p",
              appearance: "footnote",
              tone: "destructive",
              attributes: [h.Role("alert")],
              // The failure's details are for diagnostics; readers get what to do next.
              children: [i18n._(msg`Couldn't save. Try again.`)],
            },
            h,
          ),
        ]
      : []),
  ])
}
