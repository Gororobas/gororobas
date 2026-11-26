import { Effect } from "effect"
import { SqlClient } from "effect/sql"

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient

  yield* sql`-- Create "place_climate_profiles" table
CREATE TABLE "place_climate_profiles" (
  "whos_on_first_id" text NOT NULL,
  "elevation_key" integer NOT NULL,
  "generation" text NOT NULL,
  "state" text NOT NULL,
  "profile" text NULL,
  PRIMARY KEY ("whos_on_first_id", "elevation_key")
)`
})
