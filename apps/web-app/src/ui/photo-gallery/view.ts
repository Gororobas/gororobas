import { Style } from "@pleat/core"
import { Array as EffectArray, Option, Stream } from "effect"
import type { Html, HtmlBuilder } from "foldkit/html"

import { masonryColumns } from "../../lib/masonry"
import { streamMediaQueryMatches } from "../../lib/media-query"
import { AppText } from "../app-text"
import type { MediaDimensions } from "../media-credit"
import { styledAttributes } from "../pleat-attributes"
import { radius, space, tones } from "../theme"

/** What the gallery needs of a photo, wherever it comes from. */
export type GalleryPhoto = Readonly<{
  key: string
  src: (width: 300 | 1280) => string
  maybeCaption: Option.Option<string>
  /** As displayed, so its space is reserved before it loads. */
  maybeDimensions: Option.Option<MediaDimensions>
}>

const figureStyle = Style.make({ display: "grid", rowGap: space[2], margin: 0 })

/** Positions overlays such as a credit badge without clipping the popovers they open. */
const areaStyle = Style.make({ position: "relative" })

/** The photo's own shape, filled with a quiet color until it loads. */
const frameStyle = Style.make({
  inlineSize: "100%",
  overflow: "hidden",
  borderRadius: radius.md,
  backgroundColor: tones.primary.ramp[300],
})

const featuredFrameStyle = Style.make({ borderRadius: radius.lg, maxBlockSize: "36rem" })

const imageStyle = Style.make({
  display: "block",
  inlineSize: "100%",
  blockSize: "100%",
  objectFit: "cover",
})

const masonryStyle = Style.make({
  display: "grid",
  gridAutoFlow: "column",
  gridAutoColumns: "minmax(0, 1fr)",
  alignItems: "start",
  columnGap: space[3],
})

const masonryColumnStyle = Style.make({ display: "grid", rowGap: space[4] })

/** Providers don't always tell a photo's size; a landscape frame then stands in for it. */
const UNKNOWN_DIMENSIONS: MediaDimensions = { width: 4, height: 3 }

const dimensionsOf = (photo: GalleryPhoto): MediaDimensions =>
  Option.getOrElse(photo.maybeDimensions, () => UNKNOWN_DIMENSIONS)

export type FigureConfig<Photo extends GalleryPhoto> = Readonly<{
  photo: Photo
  /** The first photo of a gallery: wider corners, and loaded right away. */
  isFeatured?: boolean
  /** Drawn over the photo, such as a badge crediting who took it. */
  overlay?: (photo: Photo) => ReadonlyArray<Html>
}>

/** A photo in its own shape, with its caption below. */
export const figure = <Message, Photo extends GalleryPhoto>(
  { photo, isFeatured = false, overlay }: FigureConfig<Photo>,
  h: HtmlBuilder<Message>,
): Html => {
  const { width, height } = dimensionsOf(photo)

  return h.keyed("figure")(photo.key, styledAttributes([], figureStyle), [
    h.div(styledAttributes([], areaStyle), [
      h.div(
        styledAttributes(
          [h.Style({ "aspect-ratio": `${width} / ${height}` })],
          frameStyle,
          ...(isFeatured ? [featuredFrameStyle] : []),
        ),
        [
          h.img(
            styledAttributes(
              [
                h.Src(photo.src(1280)),
                h.Alt(Option.getOrElse(photo.maybeCaption, () => "")),
                h.Attribute("width", String(width)),
                h.Attribute("height", String(height)),
                h.Attribute("loading", isFeatured ? "eager" : "lazy"),
              ],
              imageStyle,
            ),
          ),
        ],
      ),
      ...(overlay?.(photo) ?? []),
    ]),
    ...EffectArray.fromOption(
      Option.map(photo.maybeCaption, (text) =>
        h.figcaption(
          [],
          [AppText.view({ element: "span", appearance: "footnote", children: [text] }, h)],
        ),
      ),
    ),
  ])
}

/** Columns balanced by the photos' heights, so none runs much longer than the others. */
export const masonry = <Message, Photo extends GalleryPhoto>(
  {
    photos,
    columnCount,
    overlay,
  }: Readonly<{
    photos: ReadonlyArray<Photo>
    columnCount: number
    overlay?: (photo: Photo) => ReadonlyArray<Html>
  }>,
  h: HtmlBuilder<Message>,
): Html =>
  h.div(
    styledAttributes([], masonryStyle),
    masonryColumns(photos, {
      columnCount,
      heightRatio: (photo) => {
        const { width, height } = dimensionsOf(photo)
        return height / width
      },
    }).map((column) =>
      h.div(
        styledAttributes([], masonryColumnStyle),
        column.map((photo) => figure({ photo, ...(overlay === undefined ? {} : { overlay }) }, h)),
      ),
    ),
  )

const NARROW_COLUMN_COUNT = 2
const WIDE_COLUMN_COUNT = 3

/** `breakpoint.md`, where a gallery has room for another column. */
const WIDE_GALLERY_QUERY = "(min-width: 48rem)"

/** Galleries lay photos out in JavaScript, so their pages follow the viewport's width with this. */
export const streamColumnCount: Stream.Stream<number> = streamMediaQueryMatches(
  WIDE_GALLERY_QUERY,
).pipe(Stream.map((isWide) => (isWide ? WIDE_COLUMN_COUNT : NARROW_COLUMN_COUNT)))

/** Until the viewport is read, phones' column count. */
export const initialColumnCount = NARROW_COLUMN_COUNT
