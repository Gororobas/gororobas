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

        // Yielded stores identifier scopes as JSON tuples, without subject foreign keys.
        const emailScope = (column: string) => {
          const tuple = sql`CASE WHEN json_valid(${sql(column)}) THEN ${sql(column)} ELSE '[]' END`
          return sql`json_extract(${tuple}, '$[0]') = 'email' AND json_extract(${tuple}, '$[1]') = ${email}`
        }
        const proofBinding = sql`(json_extract(binding, '$.identifier.namespace') = 'email'
      AND json_extract(binding, '$.identifier.value') = ${email})
      OR json_extract(binding, '$.revision.subjectId') = ${id}`

        yield* sql`DELETE FROM auth_proof_requests WHERE EXISTS (
      SELECT 1 FROM auth_proof_generations g WHERE g.module_id = auth_proof_requests.module_id
      AND g.purpose = auth_proof_requests.purpose AND g.request_id = auth_proof_requests.request_id
      AND (${proofBinding}))`
        yield* sql`DELETE FROM auth_proof_failures WHERE ${emailScope("series_key")}`
        yield* sql`DELETE FROM auth_proof_scopes WHERE (${emailScope("scope_key")}) OR (scope_kind = 'subject' AND scope_key = ${id})`
        yield* sql`DELETE FROM auth_proof_abuse WHERE (${emailScope("scope_key")}) OR (scope_kind = 'subject' AND scope_key = ${id})`
        yield* sql`DELETE FROM auth_proof_continuations WHERE ${proofBinding}`
        yield* sql`DELETE FROM auth_proof_generations WHERE ${proofBinding}`
        yield* sql`DELETE FROM auth_proof_series WHERE ${emailScope("scope_key")}`
        yield* sql`DELETE FROM auth_subjects WHERE id = ${id}`
      }).pipe(sql.withTransaction),
    ),
})
