# Glossary

Terms the code uses with one meaning only. When a concept here appears in code, SQL or the API, use its name as written.

## Content

**Revision**: one entry in a CRDT document's update log: a Loro update, the frontier it applies on and who created it. Wiki articles (`wiki_article_revisions`) and publications (`publication_revisions`) both keep revisions. A publication's revisions are approved automatically and applied as soon as they're saved. A wiki article's revisions wait for an evaluation before they're applied.

**Loro commit**: Loro's own `document.commit()`, which groups operations inside a CRDT document and carries a `CrdtCommit` message (`HumanCommit` or `SystemCommit`) naming the author. It's an implementation detail of a revision, not a stored record of its own.

**Language fallback**: when content isn't available in the requested language, readers fall back to the requested language, then Portuguese, Spanish and English (`languageFallbackOrder`). SQL readers sort by the same order with `orderByLanguagePreference`.

**Interface language**: the `SupportedLanguage` a person reads the web app in, the first segment of every path (`/pt/gente`, `/en/people`). It's a language, never a locale: there is no geographic localization, and Intl gets regional tags (`pt-BR`, `es-419`, `en-US`) from `intlTags`. Paths without one redirect to the detected language: the saved preference, then the browser's, then the default, the first `SupportedLanguage` (English). Content loads in the interface language, falling back through `languageFallbackOrder` when it has no translation.

**Preferred language**: the `SupportedLanguage` a person chose for Gororobas to speak to them in, stored on their account (`people.preferred_language`) and shown in their settings. It starts as the interface language they signed up in, and choosing another one in settings also switches the interface language. Emails a person asked for, such as sign-in codes, use the interface language of the device that asked.

**Search scope**: what a search covers (`SearchScope` in `apps/web-app/src/app/search-query.ts`): everything, or one type of result with only the filters that type offers. A wiki scope may name an article kind, which carries that kind's filters, so a plant's planting methods can't be set on a book search. URLs keep it as flat, localized parameters (`?secao=enciclopedia&tipo=vegetais`), and parameters the scope doesn't offer read as absent.

**Evaluation**: a moderator's verdict on a pending wiki revision: `PENDING`, `APPROVED` or `REJECTED` (`RevisionEvaluation`). The API payload, the TypeScript input and the `evaluation` column all use this name.

**Enrichment**: the derived work a committed change requests: external provider data and link inference for approved wiki articles, link inference and translations for publication content, translations for comments. Services request it through `Enrichment` (`apps/server/src/enrichment/`), which waits for the change's transaction to commit (`sql.afterCommit`); requests are best-effort and logged when they fail.

**Deleted comment**: a publication comment its author deleted (or whose author deleted their account) while other people's replies remain under it (`DeletedPublicationCommentRow`). It keeps its place in the thread, with `deleted_at` set and no owner, content, revisions or translations, and readers see "This comment has been deleted". A deleted comment no reply remains under is removed for good.

**External data observation**: one provider's answer to one external data fetch for a wiki article, stored with the article frontier and inputs it was fetched for: the raw responses on success, the `ExternalDataFetchError` on failure (`wiki_article_external_data_observations`). Projections such as Wikipedia links, GBIF media and book editions are replaced only by successful observations.

**Imported media**: a provider's photo downloaded into our own media assets by the external data fetch, so it's served at every size like uploads (`importProviderPhotos`, `apps/server/src/wiki/external-data/photo-imports.ts`). It has no owner profile, carries the provider's credits and license (`media_assets.license_url`), and `media_asset_imports` records the file it came from: each file is imported once, and refreshes link the same asset again. Articles link to it through `wiki_article_external_media`; a refresh that no longer lists it removes only the link. Like uploads, it's approved by default and can be censored.

**Successional group**: when a plant lives in natural succession, as syntropic agriculture groups plants (`SuccessionalGroup`): placentas I and II, secondaries I and II, and climax. Syntropedia calls it "grupo ecológico"; it isn't a stratum, which is about light, nor a lifecycle, which is about how long we keep the plant.

**External ID resolution**: proposing which provider record (a Wikidata item, a Google Books volume) an article is about when the article has no ID, with the evidence that found it (`ExternalIdResolution`, `apps/server/src/wiki/external-data/id-resolution.ts`). Resolution never edits articles; assigning the ID is an edit for a person to review.

## Places

**Place**: a PLACE wiki article: anywhere people recognize, from countries and municipalities to biomes, páramos and watersheds (`PlaceKind`). Whether it's a single territory or a kind of place found in many regions, people perceive it as a place.

**Gazetteer place**: a country, state or municipality from the gazetteer (Who's On First), identified by its `WhosOnFirstId`. It becomes a place wiki article the first time something references it, created by the system and attributed to no one, along with its ancestors' articles; `place_projections` maps one to the other. A gazetteer place never gets a second article: an existing article with its Who's On First ID, or else its Wikidata ID, is reused.

**Parent place**: the place containing another (`parentPlaceId`): a municipality's state, a state's country.

**Profile location**: one entry of a profile's location timeline: a place, with an optional label and device elevation (only when the device was inside the place), or free text in the owner's words, with optional partial dates and its own `InformationVisibility`. Coordinates are never stored. The **latest location** is the first entry in timeline order (open-ended entries, then the latest started); profile cards show it only when it's public.

**Bookmark visibility**: who sees the wiki articles a profile saved (its bookmarks), set by the profile's `bookmarksVisibility` (`InformationVisibility`). Its owner always sees them; when a reader can't, the profile page leaves the saved section and tab out entirely.

**Profile photos**: images credited to the profile through `media_asset_credits`, as the person who took them. Media they uploaded but didn't take isn't among them: it belongs with their contributions.

## Moderation

**Moderation status**: where a publication, publication comment or media asset stands in the moderation lifecycle: `APPROVED_BY_DEFAULT`, `CENSORED` or `REAPPROVED_AFTER_CENSORING` (`ModerationStatus`, stored in `moderation_status`).

**Moderation decision**: what a moderator does to content: censor or reapprove it (`ModerationDecision`, the `decision` in moderation payloads). Applying a decision changes the content's moderation status.

**Moderation event**: the record of one moderation decision that changed content's status: who decided, when, why and the status it left (`moderation_events`, written by `recordModerationDecision`). It's moderation's counterpart to a revision's evaluation.

**Content visibility**: who can see a publication and the media attached to it (`canViewContent` in `packages/domain/src/content-visibility/`). Censored content is only visible to its authors, a newcomer's or blocked person's content to them and to moderators, and otherwise visibility follows `PUBLIC`/`COMMUNITY` and organization membership. Queries apply the same rule in SQL through `visibleTo`.

**Hidden profile**: what readers who may not see a profile (`profilePolicies.canRead`) get in its place where content it owns appears, such as a publication card's owner (`HiddenProfile`): no name, photo, location or ID. The web app shows it as a "Mysterious author".

## Handles

**Handle**: the readable, URL-safe name of a profile, publication or wiki article (`Handle`). `apps/server/src/common/handle-allocation.ts` gives every entity its handles: `claimHandle` takes one someone chose or fails with `HandleTakenError`, and `allocateHandle` derives one from names, adding a random six-character suffix when they're taken. People check whether a handle is free before taking one through `getHandleAvailability`, which counts their own current handle as free. A wiki article gets a handle per language the first time it has a translation in that language, and keeps it after renames, so old links keep working.
