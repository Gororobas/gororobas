import { AudiovisualFormat } from "../../common/enums.js"
import { defineProperty } from "../property.js"

/**
 * Whether the work is a film or a series: what schema.org tells apart as `Movie` and `TVSeries`,
 * and what decides whether runtime, seasons and episodes apply. Documentaries and shorts are
 * genres, not formats.
 */
export const AudiovisualFormatProperty = defineProperty({
  id: "audiovisualFormat",
  valueSchema: AudiovisualFormat,
  kinds: ["FILM"],
  scope: "UNIVERSAL",
  cardinality: "ONE",
  sources: (source) => [
    source.person(),
    source.tmdb({
      extract: (work) => [source.found(work.mediaType === "movie" ? "FILM" : "SERIES")],
    }),
  ],
})
