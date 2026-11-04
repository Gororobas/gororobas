import type { AreaGeometry, BoundingBox } from "@gororobas/domain/places/geometry"
import { Style } from "@pleat/core"
import type { Html, HtmlBuilder } from "foldkit/html"

import { styledAttributes } from "../pleat-attributes"
import { radius, tones } from "../theme"

const VIEWBOX_SIZE = 100
const PADDING = 6

const outlineStyle = Style.make({
  display: "block",
  inlineSize: "100%",
  aspectRatio: "1",
  borderRadius: radius.md,
  backgroundColor: tones.neutral.shade[200],
})

// NOTE: Ramp steps, not shades: the area reads as the same gold patch in light and dark modes.
const areaStyle = Style.make({
  fill: tones.primary.ramp[500],
  stroke: tones.primary.ramp[700],
  strokeWidth: 1,
  strokeLinejoin: "round",
  vectorEffect: "non-scaling-stroke",
})

/**
 * The area's rings as an SVG path in a 100×100 view box. Longitudes shrink by the cosine of the
 * area's middle latitude, so shapes keep their proportions away from the equator.
 */
export const outlinePath = (geometry: AreaGeometry, box: BoundingBox): string => {
  const middleLatitude = ((box.minLatitude + box.maxLatitude) / 2) * (Math.PI / 180)
  const xScale = Math.cos(middleLatitude)
  const width = (box.maxLongitude - box.minLongitude) * xScale
  const height = box.maxLatitude - box.minLatitude
  const scale = (VIEWBOX_SIZE - 2 * PADDING) / Math.max(width, height, Number.EPSILON)
  const offsetX = (VIEWBOX_SIZE - width * scale) / 2
  const offsetY = (VIEWBOX_SIZE - height * scale) / 2

  const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates

  return polygons
    .flatMap((rings) =>
      rings.map(
        (ring) =>
          `${ring
            .map(([longitude, latitude], index) => {
              const x = offsetX + (longitude - box.minLongitude) * xScale * scale
              const y = offsetY + (box.maxLatitude - latitude) * scale
              return `${index === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`
            })
            .join("")}Z`,
      ),
    )
    .join("")
}

/** A place's simplified outline, so people see the area their location records. It fills its
 *  container's width, as a square. */
export const view = <Message>(
  config: Readonly<{
    geometry: AreaGeometry
    boundingBox: BoundingBox
    label: string
    styles?: ReadonlyArray<Style.Style>
  }>,
  h: HtmlBuilder<Message>,
): Html =>
  h.svg(
    styledAttributes(
      [
        h.Xmlns("http://www.w3.org/2000/svg"),
        h.ViewBox(`0 0 ${VIEWBOX_SIZE} ${VIEWBOX_SIZE}`),
        h.Role("img"),
        h.AriaLabel(`Contorno de ${config.label}`),
      ],
      outlineStyle,
      ...(config.styles ?? []),
    ),
    [
      h.title([], [`Contorno de ${config.label}`]),
      h.path(
        styledAttributes(
          [
            h.D(outlinePath(config.geometry, config.boundingBox)),
            h.Attribute("fill-rule", "evenodd"),
          ],
          areaStyle,
        ),
      ),
    ],
  )
