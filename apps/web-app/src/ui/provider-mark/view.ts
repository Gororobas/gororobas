import type { ExternalDataProvider } from "@gororobas/domain/wiki/domain"
import { Style } from "@pleat/core"
import { css } from "@pleat/foldkit"
import { type Html, inertHtml } from "foldkit/html"

type Provider = typeof ExternalDataProvider.Type

export const providerNames: Readonly<Record<Provider, string>> = {
  WIKIDATA: "Wikidata",
  GBIF: "GBIF",
  GOOGLE_BOOKS: "Google Livros",
}

const markStyle = Style.make({
  display: "block",
  blockSize: "1em",
  inlineSize: "auto",
  flexShrink: 0,
})

const svg = (viewBox: string, children: string): Html =>
  inertHtml.svg([
    inertHtml.AriaHidden(true),
    inertHtml.ViewBox(viewBox),
    ...css(markStyle),
    inertHtml.InnerHTML(children),
  ])

/** Wikidata's bars: its red, green and blue stripes of varying widths. */
const wikidataBars = [
  ["#990000", 0, 2],
  ["#990000", 3, 1],
  ["#339966", 5, 3],
  ["#339966", 9, 1],
  ["#339966", 11, 3],
  ["#006699", 15, 1],
  ["#006699", 17, 2],
  ["#006699", 20, 3],
  ["#006699", 24, 1],
] as const

const wikidataMark = (): Html =>
  svg(
    "0 0 25 16",
    wikidataBars
      .map(
        ([fill, x, width]) => `<rect x="${x}" y="0" width="${width}" height="16" fill="${fill}"/>`,
      )
      .join(""),
  )

const gbifMark = (): Html =>
  svg(
    "0 0 40 16",
    '<text x="0" y="13.5" font-family="system-ui, sans-serif" font-size="15" font-weight="800" letter-spacing="-0.5" fill="#4E9F37">GBIF</text>',
  )

/** An open book in Google's blue. */
const googleBooksMark = (): Html =>
  svg(
    "0 0 24 20",
    '<path fill="#4285F4" d="M1 2.5C4.5 1 8.5 1.3 11 3.4V19c-2.5-1.8-6.5-2-10-.6zM23 2.5C19.5 1 15.5 1.3 13 3.4V19c2.5-1.8 6.5-2 10-.6z"/>',
  )

/** Marks that spell the provider's name, which needn't be written beside them. */
export const isWordmark: Readonly<Record<Provider, boolean>> = {
  WIKIDATA: false,
  GBIF: true,
  GOOGLE_BOOKS: false,
}

/** Identifies a provider wherever its data shows, beside its name unless it spells it. */
export const mark = (provider: Provider): Html =>
  ({ WIKIDATA: wikidataMark, GBIF: gbifMark, GOOGLE_BOOKS: googleBooksMark })[provider]()
