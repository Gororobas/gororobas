# Glossary

Terms the code uses with one meaning only. When a concept here appears in code, SQL or the API, use its name as written.

## Content

**Revision**: one entry in a CRDT document's update log: a Loro update, the frontier it applies on and who created it. Wiki articles (`wiki_article_revisions`) and publications (`publication_revisions`) both keep revisions. A publication's revisions are approved automatically and applied as soon as they're saved. A wiki article's revisions wait for an evaluation before they're applied.

**Loro commit**: Loro's own `document.commit()`, which groups operations inside a CRDT document and carries a `CrdtCommit` message (`HumanCommit` or `SystemCommit`) naming the author. It's an implementation detail of a revision, not a stored record of its own.

**Language fallback**: when content isn't available in the requested language, readers fall back to the requested language, then Portuguese, Spanish and English (`languageFallbackOrder`). SQL readers sort by the same order with `orderByLanguagePreference`.
