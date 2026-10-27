import { Theme, Token } from "@pleat/core"

/** Non-color scales. Deliberately small: views pick a step, they don't invent values. */
export const primitives = Token.make(
  {
    space: {
      0: Token.length,
      1: Token.length,
      2: Token.length,
      3: Token.length,
      4: Token.length,
      5: Token.length,
      6: Token.length,
      7: Token.length,
      8: Token.length,
      9: Token.length,
      10: Token.length,
      11: Token.length,
      12: Token.length,
    },
    radius: { sm: Token.length, md: Token.length, lg: Token.length, full: Token.length },
    fontFamily: { body: Token.fontFamily, code: Token.fontFamily },
    fontSize: {
      caption: Token.length,
      footnote: Token.length,
      regular: Token.length,
      large: Token.length,
      xl: Token.length,
      xxl: Token.length,
      display: Token.length,
    },
    fontWeight: {
      regular: Token.number,
      medium: Token.number,
      semibold: Token.number,
      bold: Token.number,
    },
    lineHeight: { tight: Token.value, normal: Token.value, relaxed: Token.value },
    duration: {
      fast: Token.duration,
      moderate: Token.duration,
      slow: Token.duration,
      control: Token.duration,
      composer: Token.duration,
    },
    easing: { standard: Token.value, emphasized: Token.value },
    borderWidth: { hairline: Token.length, strong: Token.length, thick: Token.length },
    /** Content widths, from a narrow dialog to the widest page. */
    measure: {
      narrow: Token.length,
      form: Token.length,
      prose: Token.length,
      page: Token.length,
      wide: Token.length,
    },
    /** Block sizes of tappable controls: buttons, icon buttons, inputs. */
    controlSize: { sm: Token.length, md: Token.length, lg: Token.length },
    /** Stacking order, lowest first. */
    layer: {
      raised: Token.number,
      sticky: Token.number,
      header: Token.number,
      overlay: Token.number,
      modal: Token.number,
    },
    /** The dimmed layer behind modals and media; the same in every color mode. */
    scrim: Token.color,
    /** Text and icons laid over the scrim or over photos and video. */
    onScrim: Token.color,
    /** Letterboxing behind photos and video, which stays black in every mode. */
    mediaBackdrop: Token.color,
  },
  { prefix: "gororobas-" },
)

export const {
  space,
  radius,
  fontFamily,
  fontSize,
  fontWeight,
  lineHeight,
  duration,
  easing,
  borderWidth,
  measure,
  controlSize,
  layer,
  scrim,
  onScrim,
  mediaBackdrop,
} = primitives

export const primitivesTheme = Theme.make(primitives, {
  space: {
    0: "0",
    1: "0.25rem",
    2: "0.5rem",
    3: "0.75rem",
    4: "1rem",
    5: "1.25rem",
    6: "1.5rem",
    7: "1.75rem",
    8: "2rem",
    9: "2.5rem",
    10: "3rem",
    11: "3.5rem",
    12: "4rem",
  },
  // Elliptical, size-relative radii: small elements get tight corners, large surfaces get
  // generous ones, without per-component radius tokens.
  radius: {
    sm: "clamp(0.375rem, 2%, 0.75rem) / clamp(0.375rem, 12%, 0.875rem)",
    md: "clamp(0.5rem, 3%, 1rem) / clamp(0.5rem, 16%, 1rem)",
    lg: "clamp(0.625rem, 4%, 1.25rem) / clamp(0.625rem, 20%, 1.25rem)",
    // Pills and circles: half the shorter side, whatever the element's proportions.
    full: "9999px",
  },
  fontFamily: {
    body: '"Alan Sans Variable", "Alan Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    code: 'source-code-pro, Menlo, Monaco, Consolas, "Courier New", monospace',
  },
  fontSize: {
    caption: "0.75rem",
    footnote: "0.875rem",
    regular: "1rem",
    large: "1.3125rem",
    xl: "1.5rem",
    xxl: "1.875rem",
    display: "2.25rem",
  },
  fontWeight: { regular: 400, medium: 500, semibold: 600, bold: 700 },
  // `cqw` falls back to the small viewport width when no container is declared, so line
  // heights loosen slightly on wide screens.
  lineHeight: {
    tight: "clamp(1.2em, calc(1.2em + 0.3cqw), 1.5em)",
    normal: "clamp(1.45em, calc(1.45em + 0.3cqw), 1.75em)",
    relaxed: "clamp(1.6em, calc(1.6em + 0.35cqw), 1.9em)",
  },
  duration: {
    fast: "150ms",
    moderate: "200ms",
    slow: "320ms",
    control: primitives.duration.fast,
    composer: "220ms",
  },
  easing: { standard: "ease-out", emphasized: "cubic-bezier(0.22, 1, 0.36, 1)" },
  borderWidth: { hairline: "1px", strong: "2px", thick: "4px" },
  measure: { narrow: "28rem", form: "36rem", prose: "48rem", page: "64rem", wide: "80rem" },
  controlSize: { sm: "2.25rem", md: "2.5rem", lg: "2.75rem" },
  layer: { raised: 1, sticky: 10, header: 20, overlay: 40, modal: 50 },
  scrim: "rgb(0 0 0 / 50%)",
  onScrim: "#fff",
  mediaBackdrop: "#000",
})
