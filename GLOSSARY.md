# Glossary

Terms the code uses with one meaning only. When a concept here appears in code, SQL or the API, use its name as written.

## Content

**Revision**: one entry in a CRDT document's update log: a Loro update, the frontier it applies on and who created it. Wiki articles (`wiki_article_revisions`) and publications (`publication_revisions`) both keep revisions. A publication's revisions are approved automatically and applied as soon as they're saved. A wiki article's revisions wait for an evaluation before they're applied.

**Loro commit**: Loro's own `document.commit()`, which groups operations inside a CRDT document and carries a `CrdtCommit` message (`HumanCommit` or `SystemCommit`) naming the author. It's an implementation detail of a revision, not a stored record of its own.

**Language fallback**: when content isn't available in the requested language, readers fall back to the requested language, then Portuguese, Spanish and English (`languageFallbackOrder`). SQL readers sort by the same order with `orderByLanguagePreference`.

**Evaluation**: a moderator's verdict on a pending wiki revision: `PENDING`, `APPROVED` or `REJECTED` (`RevisionEvaluation`). The API payload, the TypeScript input and the `evaluation` column all use this name.

## Moderation

**Moderation status**: where a publication, publication comment or media asset stands in the moderation lifecycle: `APPROVED_BY_DEFAULT`, `CENSORED` or `REAPPROVED_AFTER_CENSORING` (`ModerationStatus`, stored in `moderation_status`).

**Moderation decision**: what a moderator does to content: censor or reapprove it (`ModerationDecision`, the `decision` in moderation payloads). Applying a decision changes the content's moderation status.

## Handles

**Handle**: the readable, URL-safe name of a profile, publication or wiki article (`Handle`). `apps/server/src/common/handle-allocation.ts` gives every entity its handles: `claimHandle` takes one someone chose or fails with `HandleTakenError`, and `allocateHandle` derives one from names, adding a random suffix when they're taken. A wiki article gets a handle per language the first time it has a translation in that language, and keeps it after renames, so old links keep working.
