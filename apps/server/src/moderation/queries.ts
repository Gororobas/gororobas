import {
  NewcomerAwaitingApproval,
  RevisionAwaitingEvaluation,
  WikiArticleStatus,
} from "@gororobas/domain"
import { Schema, Struct } from "effect"
import { SqlClient, SqlSchema } from "effect/sql"

export const listNewcomersAwaitingApproval = SqlSchema.findAll({
  Request: Schema.Void,
  Result: NewcomerAwaitingApproval.mapFields(Struct.omit(["_tag"])),
  execute: () =>
    SqlClient.SqlClient.use(
      (sql) => sql`
      SELECT people.id AS person_id, profiles.handle, profiles.name, profiles.created_at AS waiting_since
      FROM people
      JOIN profiles ON profiles.id = people.id
      JOIN auth_subjects ON auth_subjects.id = people.id AND auth_subjects.active = 1
      WHERE people.access_level = 'NEWCOMER'
      ORDER BY profiles.created_at ASC, people.id ASC
    `,
    ),
})

export const listRevisionsAwaitingEvaluation = SqlSchema.findAll({
  Request: Schema.Void,
  Result: RevisionAwaitingEvaluation.mapFields((fields) => ({
    ...Struct.omit(fields, ["_tag", "proposesNewArticle"]),
    articleStatus: WikiArticleStatus,
  })),
  execute: () =>
    SqlClient.SqlClient.use(
      (sql) => sql`
      SELECT
        revisions.id AS revision_id,
        revisions.wiki_article_id,
        crdts.status AS article_status,
        articles.kind,
        (SELECT handles.handle FROM wiki_article_handles handles
          WHERE handles.wiki_article_id = revisions.wiki_article_id
          ORDER BY handles.handle LIMIT 1) AS handle,
        revisions.created_by_id,
        revisions.created_at AS waiting_since
      FROM wiki_article_revisions revisions
      JOIN wiki_article_crdts crdts ON crdts.id = revisions.wiki_article_id
      LEFT JOIN wiki_articles articles ON articles.id = revisions.wiki_article_id
      WHERE revisions.evaluation = 'PENDING'
      ORDER BY revisions.created_at ASC, revisions.rowid ASC
    `,
    ),
})
