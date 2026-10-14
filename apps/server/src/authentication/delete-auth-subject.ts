import { Email, ProfileId } from "@gororobas/domain"
import { Effect, Option, Schema } from "effect"
import { SqlClient, SqlSchema } from "effect/sql"

const findSubjectEmail = SqlSchema.findOneOption({
  Request: ProfileId,
  Result: Schema.Struct({ email: Email }),
  execute: (id) =>
    SqlClient.SqlClient.use((sql) => sql`SELECT email FROM auth_subjects WHERE id = ${id}`),
})

export const deleteAuthSubject = SqlSchema.void({
  Request: ProfileId,
  execute: (id) =>
    SqlClient.SqlClient.use((sql) =>
      Effect.gen(function* () {
        const subject = yield* findSubjectEmail(ProfileId.make(id))
        if (Option.isNone(subject)) return
        const { email } = subject.value

        // Proof bindings have no subject foreign key before account provisioning.
        yield* sql`DELETE FROM auth_proofs WHERE
          (json_extract(binding, '$.identifier.namespace') = 'email'
            AND json_extract(binding, '$.identifier.value') = ${email})
          OR json_extract(binding, '$.revision.subjectId') = ${id}`
        yield* sql`DELETE FROM auth_subjects WHERE id = ${id}`
      }).pipe(sql.withTransaction),
    ),
})
