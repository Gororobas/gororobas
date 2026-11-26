import { PlaceClimateProfile, WhosOnFirstId } from "@gororobas/domain"
import { Schema } from "effect"
import { SqlClient, SqlSchema } from "effect/sql"

export const ClimateGeneration = Schema.Struct({
  whosOnFirstId: WhosOnFirstId,
  generation: Schema.String,
  elevationMeters: Schema.NullOr(Schema.Int),
})

export const requestClimateGeneration = SqlSchema.findOneOption({
  Request: ClimateGeneration,
  Result: ClimateGeneration,
  execute: ({ whosOnFirstId, elevationMeters, generation }) =>
    SqlClient.SqlClient.use(
      (sql) => sql`
        INSERT INTO place_climate_profiles (whos_on_first_id, elevation_key, generation, state)
        VALUES (${whosOnFirstId}, ${elevationMeters ?? -10000}, ${generation}, 'GENERATING')
        ON CONFLICT (whos_on_first_id, elevation_key) DO UPDATE SET
          generation = CASE WHEN state = 'UNAVAILABLE' THEN excluded.generation ELSE generation END,
          state = 'GENERATING'
        WHERE state <> 'AVAILABLE'
        RETURNING whos_on_first_id, NULLIF(elevation_key, -10000) AS elevation_meters, generation
      `,
    ),
})

export const finishClimateGeneration = SqlSchema.void({
  Request: Schema.Struct({
    ...ClimateGeneration.fields,
    profile: Schema.NullOr(Schema.fromJsonString(PlaceClimateProfile)),
  }),
  execute: ({ whosOnFirstId, elevationMeters, generation, profile }) =>
    SqlClient.SqlClient.use(
      (sql) => sql`
        UPDATE place_climate_profiles SET
          state = ${profile === null ? "UNAVAILABLE" : "AVAILABLE"}, profile = ${profile}
        WHERE whos_on_first_id = ${whosOnFirstId} AND elevation_key = ${elevationMeters ?? -10000} AND generation = ${generation}
      `,
    ),
})
