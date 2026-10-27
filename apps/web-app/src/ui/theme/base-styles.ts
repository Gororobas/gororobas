import "@fontsource-variable/alan-sans"
import "blobatar/motion.css"
import { type Declarations, Global, When } from "@pleat/core"

import { toneColors } from "./color-theme"
import { fontFamily } from "./primitives"

// A port of Tailwind v4's Preflight, which the app's layouts were built against. Pleat puts
// these in `pleat.globals`, below every atom, so any component style beats them.

// NOTE: Pleat inserts rules through the CSSOM, which throws on a selector the browser doesn't
// know (a stylesheet would skip the rule), and the throw stops the app from mounting. Rules
// for engine-specific or recent selectors go inside `@supports selector(…)`, which parses
// everywhere and only applies where the selector exists.
const engineRule = (selector: string, declarations: Declarations): void =>
  Global.rule(selector, declarations, { when: When.supports(`selector(${selector})`) })

// NOTE: Chromium styles some `-webkit-` pseudo-elements that `@supports selector()` reports as
// unknown, so those probe for one it does report, which only WebKit and Blink know.
const webkitRule = (selector: string, declarations: Declarations): void =>
  Global.rule(selector, declarations, {
    when: When.supports("selector(::-webkit-search-cancel-button)"),
  })

const boxReset = {
  boxSizing: "border-box",
  margin: 0,
  padding: 0,
  border: "0 solid",
  borderColor: toneColors.border,
  outlineColor: `color-mix(in srgb, ${toneColors.focus} 50%, transparent)`,
  cornerShape: "superellipse(1.5)",
} satisfies Declarations

Global.rule("*, ::after, ::before, ::backdrop", boxReset)
engineRule("::file-selector-button", boxReset)

Global.rule("html, :host", {
  lineHeight: 1.5,
  WebkitTextSizeAdjust: "100%",
  tabSize: 4,
  fontFamily: fontFamily.body,
  WebkitTapHighlightColor: "transparent",
  colorScheme: "light dark",
  overscrollBehaviorY: "none",
})

Global.rule("body", {
  minBlockSize: "100svh",
  overscrollBehaviorY: "none",
  backgroundColor: toneColors.background,
  color: toneColors.foreground,
  WebkitFontSmoothing: "antialiased",
  MozOsxFontSmoothing: "grayscale",
})

Global.rule("hr", { blockSize: 0, color: "inherit", borderBlockStartWidth: "1px" })
Global.rule("abbr:where([title])", { textDecoration: "underline dotted" })
Global.rule("h1, h2, h3, h4, h5, h6", { fontSize: "inherit", fontWeight: "inherit" })
Global.rule("a", { color: "inherit", textDecoration: "inherit" })
Global.rule("b, strong", { fontWeight: "bolder" })
Global.rule("code, kbd, samp, pre", { fontFamily: fontFamily.code, fontSize: "1em" })
Global.rule("small", { fontSize: "80%" })

Global.rule("sub, sup", {
  fontSize: "75%",
  lineHeight: 0,
  position: "relative",
  verticalAlign: "baseline",
})

Global.rule("sub", { insetBlockEnd: "-0.25em" })
Global.rule("sup", { insetBlockStart: "-0.5em" })
Global.rule("table", { textIndent: 0, borderColor: "inherit", borderCollapse: "collapse" })
Global.rule("progress", { verticalAlign: "baseline" })
Global.rule("summary", { display: "list-item" })
Global.rule("ol, ul, menu", { listStyle: "none" })
Global.rule("img, svg, video, canvas, audio, iframe, embed, object", {
  display: "block",
  verticalAlign: "middle",
})
Global.rule("img, video", { maxInlineSize: "100%", blockSize: "auto" })

const controlReset = {
  font: "inherit",
  fontFeatureSettings: "inherit",
  fontVariationSettings: "inherit",
  letterSpacing: "inherit",
  color: "inherit",
  borderRadius: 0,
  backgroundColor: "transparent",
  opacity: 1,
} satisfies Declarations

Global.rule("button, input, select, optgroup, textarea", controlReset)
engineRule("::file-selector-button", controlReset)
Global.rule("::placeholder", {
  opacity: 1,
  color: "color-mix(in oklab, currentcolor 50%, transparent)",
})
Global.rule("textarea", { resize: "vertical" })
webkitRule("::-webkit-search-decoration", { WebkitAppearance: "none" })
engineRule("::-webkit-date-and-time-value", { minBlockSize: "1lh", textAlign: "inherit" })
engineRule("::-webkit-datetime-edit", { display: "inline-flex" })
engineRule("::-webkit-datetime-edit-fields-wrapper", { padding: 0 })
engineRule("::-webkit-calendar-picker-indicator", { lineHeight: 1 })
Global.rule("button, input:where([type=button], [type=reset], [type=submit])", {
  appearance: "button",
})
engineRule("::file-selector-button", { appearance: "button" })
engineRule("::-webkit-inner-spin-button", { blockSize: "auto" })
webkitRule("::-webkit-outer-spin-button", { blockSize: "auto" })
// NOTE: Preflight marks this `!important`, which Pleat can't write. Atoms sit in a later
// layer, so a styled element with the `hidden` attribute keeps its own `display`.
Global.rule("[hidden]:where(:not([hidden=until-found]))", { display: "none" })

// App-wide interaction defaults.
Global.rule("button, a, input, textarea, select", {
  WebkitTapHighlightColor: "transparent",
  touchAction: "manipulation",
})
Global.rule("button, [role=button]", { userSelect: "none", WebkitUserSelect: "none" })

const hiddenSearchDecoration = {
  display: "none",
  inlineSize: 0,
  blockSize: 0,
  appearance: "none",
} as const

engineRule("input[type=search]::-webkit-search-cancel-button", hiddenSearchDecoration)
webkitRule("input[type=search]::-webkit-search-decoration", hiddenSearchDecoration)

// Page and shell view transitions. The names are set by the views that take part.
const easeOutQuint = "cubic-bezier(0.22, 1, 0.36, 1)"
const pageOut = Global.keyframes("page-out", {
  to: { opacity: 0, transform: "translateY(-0.25rem)" },
})
const pageIn = Global.keyframes("page-in", {
  from: { opacity: 0, transform: "translateY(0.25rem)" },
})
const appLogoOut = Global.keyframes("app-logo-out", {
  to: { opacity: 0, transform: "translateX(-1.5rem) scale(0.6) rotate(-20deg)" },
})
const searchCancelIn = Global.keyframes("search-cancel-in", {
  from: { opacity: 0, transform: "translateX(-1rem)" },
})

const transitionRule = (selectors: ReadonlyArray<string>, declarations: Declarations): void =>
  selectors.forEach((selector) => engineRule(selector, declarations))
const postsTypes = ["posts-forward", "posts-backward"]
const journalTypes = ["journal-expand", "journal-collapse"]

transitionRule(
  postsTypes.map(
    (type) => `:root:active-view-transition-type(${type})::view-transition-group(.posts-card)`,
  ),
  { animationDuration: "360ms", animationTimingFunction: easeOutQuint },
)

transitionRule(
  postsTypes.flatMap((type) => [
    `:root:active-view-transition-type(${type})::view-transition-old(root)`,
    `:root:active-view-transition-type(${type})::view-transition-new(root)`,
  ]),
  { animation: "none" },
)

transitionRule(
  journalTypes.map(
    (type) => `:root:active-view-transition-type(${type})::view-transition-group(journal)`,
  ),
  { animationDuration: "320ms", animationTimingFunction: easeOutQuint },
)

transitionRule(
  [
    ":root::view-transition-group(app-header)",
    ":root::view-transition-old(app-header)",
    ":root::view-transition-new(app-header)",
  ],
  { animation: "none" },
)

transitionRule([":root::view-transition-new(search-cancel)"], {
  animation: `${searchCancelIn} 180ms ease both`,
})
transitionRule([":root::view-transition-old(app-logo)"], {
  animation: `${appLogoOut} 200ms ease-in both`,
})
transitionRule([":root::view-transition-new(app-logo)"], { animation: "none" })
// The header's search button and the search page's form share this name, so the browser
// moves and stretches one into the other where the logo was.
transitionRule([":root::view-transition-group(search-control)"], {
  animationDuration: "320ms",
  animationTimingFunction: easeOutQuint,
})
transitionRule(
  [":root::view-transition-old(search-control)", ":root::view-transition-new(search-control)"],
  { blockSize: "100%", objectFit: "fill" },
)
transitionRule([":root:active-view-transition-type(page)::view-transition-old(root)"], {
  animation: `${pageOut} 180ms ease`,
})
transitionRule([":root:active-view-transition-type(page)::view-transition-new(root)"], {
  animation: `${pageIn} 180ms ease`,
})

// Long-pressing a timeline item selects it, so text selection would fight the gesture.
Global.rule(
  "#journal-timeline article",
  { userSelect: "none", WebkitUserSelect: "none" },
  { when: When.media("(pointer: coarse)") },
)
