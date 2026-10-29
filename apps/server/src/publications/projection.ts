import type { SqlClient } from "effect/sql/SqlClient"

export const selectPublicationRows = (sql: SqlClient) => sql`
  SELECT projection.*, source.handle, source.owner_profile_id, source.published_at,
    source.visibility, source.moderation_status
  FROM publication_projections projection
  JOIN publication_sources source ON source.id = projection.id
`
