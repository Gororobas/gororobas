import { Schema } from "effect"

import { SpotifyResourceId, YoutubeVideoId } from "../common/external-identifiers.js"

const externalEmbedFields = {
  source: Schema.Literal("EXTERNAL_EMBED"),
  version: Schema.Literal(1),
  caption: Schema.optional(Schema.String),
}

export const YoutubeEmbed = Schema.Struct({
  ...externalEmbedFields,
  provider: Schema.Literal("YOUTUBE"),
  providerData: Schema.Struct({
    videoId: YoutubeVideoId,
  }),
})

export type YoutubeEmbed = typeof YoutubeEmbed.Type

export const SpotifyEmbed = Schema.Struct({
  ...externalEmbedFields,
  provider: Schema.Literal("SPOTIFY"),
  providerData: Schema.Struct({
    resourceType: Schema.Literals(["TRACK", "ALBUM", "PLAYLIST", "ARTIST", "EPISODE", "SHOW"]),
    resourceId: SpotifyResourceId,
  }),
})

export type SpotifyEmbed = typeof SpotifyEmbed.Type

/** Store provider identity, not arbitrary iframe HTML or duplicated remote preview metadata. */
export const ExternalEmbed = Schema.Union([YoutubeEmbed, SpotifyEmbed])
export type ExternalEmbed = typeof ExternalEmbed.Type
