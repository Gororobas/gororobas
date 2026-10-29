import { ContentOwner, ProfileId } from "@gororobas/domain"
import { SqlSchema } from "effect/sql"
import { SqlClient } from "effect/sql/SqlClient"

export const findContentOwner = SqlSchema.findOneOption({
  Request: ProfileId,
  Result: ContentOwner,
  execute: (ownerProfileId) =>
    SqlClient.use(
      (sql) => sql`
        SELECT profile.type, profile.id, person.access_level
        FROM profiles profile
        LEFT JOIN people person ON person.id = profile.id
        WHERE profile.id = ${ownerProfileId}
      `,
    ),
})
