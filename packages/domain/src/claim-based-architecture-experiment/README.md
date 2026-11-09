# Claims experiment

Wiki articles as **claims** about **properties**, with rich text kept as **article text**. Nothing
imports this folder. `properties/` has one file per property: every attribute, translation field,
external projection and relation the wiki has today, plus `growsIn` as the first new authored
relation.

## Vocabulary

| Term | Meaning |
| --- | --- |
| **Property** | The definition of one kind of fact: `isbn`, `height`, `growsIn` (`defineProperty`). |
| **Claim** | One source asserting one value of one property about one article. |
| **Value** | What a claim asserts. Qualifiers are fields of the value (`growsIn` → `{ place, nativity }`). |
| **Source** | Who asserted it, carrying their evidence. People's claims are *reviewed*; machines' are *automatic* (providers, text inference, machine translation, references in article text). |
| **Evaluation** | A moderator's verdict on something people submitted: a claim or a text revision. |
| **Moderation status** | Where an automatic claim or machine translation stands: visible by default, censorable. |
| **Flag** | A reader reporting an automatic claim, which can lead to censoring it. |
| **Retraction** | A person's claim removing another person's claim once approved. |
| **Resolution** | Turning an article's claims into what readers see, per property and language. |
| **Resolved value** | A value as readers see it, with its **attestations**: every claim asserting it. |
| **Article text** | An article's rich text in one language: a Loro document, the only CRDT left. |
| **Text revision** | One Loro update to article text, from a frontier. "Revision" keeps today's meaning, scoped to text. |
| **Changeset** | What one person submits at once to one article: claims and text revisions, with a summary. Named after OpenStreetMap's. |

Names are still split into `label` and `aliases` in `properties/`, but the intended direction is
one ordered list of **names** per language (see "Names" below). Scientific names stay a property
of their own: they name a taxon, belong to no language, and come mostly from GBIF.

## Decisions

**People are reviewed; machines are moderated.** The lifecycle follows the source, never the
property, and there are only two, so claims have two shapes (`claims.ts`) and invalid states
don't decode:

- a person's claim asserts or retracts, and has an `evaluation`;
- an automatic claim asserts, and has a `moderationStatus`. It's never pending, and never retracts.

`Evaluation` is a tagged union, so an approved claim always says who approved it and when.

Machines never propose for review. Two cases looked like they needed it, and neither does:

- **Matching an article to a provider's record** (a Wikidata ID): the form offers a Wikidata search,
  through our API, and the person's choice is their claim. Articles machines create (places from
  the gazetteer) already come with Who's On First's Wikidata concordance. Searching automatically
  for articles without an ID wouldn't add much, and a one-off backfill can be reviewed by a person
  who then asserts the results.
- **Typed facts read from text** (`growsIn` from a publication): they're `TEXT_INFERENCE`, like
  links. They show with a notice and their quote, can be flagged, and rank after people's claims.
  A property that shouldn't take a machine's reading at all leaves `TEXT_INFERENCE` out of its
  sources.

**Properties list their sources, best first.** It's one field: which sources may assert the
property, and the order resolution prefers them in. Restricting is common: identifiers never come
from text inference, providers never assert `growsIn`, only GBIF classifies taxa. Three
guarantees follow from the list:

- **Types:** listing a fetched provider requires an extractor for it, typed against that
  provider's result.
- **Claim types:** a property's `Claim` only takes the sources it lists. `resourceUrl`'s claims
  are all a person's, and `gbifTaxonId`'s name GBIF or Wikidata (`checks.ts`; `ClaimOf` drops the
  claim shape a property's sources rule out).
- **Runtime:** a claim from an unlisted source doesn't decode.

**Changesets stay.** Grouping by author and evaluation can't replace them. Two edits made days
apart would merge, a group would split as its parts get evaluated, and deleted authors would all
merge into one. A changeset also carries the summary ("from Embrapa's 2019 booklet"), links
claims with the text revisions submitted alongside them, and can be reverted as one.

**Invariants spanning fields are one value.** Examples: `height` (and every range), `activePeriod`,
`lifespan`, `contentChannels`. Evaluating claims one by one then can't accept half of an
invariant.

**Order lives in values where it's a fact.** Credits (`bookAuthors`, `filmDirectors`) keep their
`position` in the value, since order is a fact about the book. Names are the exception (below).

**Cultivars inherit by listing traits.** Today every cultivar attribute is wrapped in
`Unknown | Inherit | Value`. Now `inheritsFromParent` lists the traits shown from the plant, a
trait with its own claims shows those, and a trait with neither is unknown. Plant properties stay
plain.

**Article text is not a claim.** It's one Loro document per article and language, so a
translation never conflicts with an edit in another language. Peritext merges pending revisions,
and node IDs stay stable for evidence. Text revisions use the same two lifecycles as claims:
people's are evaluated, machine translations are moderated. Entity references in the text become
`ARTICLE_TEXT_REFERENCE` claims, replaced whenever the text changes. I'd keep CRDTs over OT here:
OT's appeal is a central server ordering operations, but pending revisions sit for days on old
frontiers, which is exactly what CRDT merging handles and OT makes you rebase.

## Text inference

One workflow reads publications and article text, and asserts two kinds of claims, both
`TEXT_INFERENCE`: links (`relatedTo`, and publications' links to articles) and typed facts.
"O mamão até que cresce bem no Cerrado" becomes a `growsIn` claim on the papaya article pointing
to the Cerrado, with the quote and the publication as evidence. This is the basis for extracting
structured knowledge from publications. Things it should handle:

- **Attestations add up.** Three publications saying papaya grows in the Cerrado are three claims
  attesting one value: readers see "mentioned in 3 publications", which says more than one person's
  claim would.
- **Hedges and experiences.** "Até que cresce bem" is one grower's experience, not a botanical
  fact. The value doesn't say so; the attestation's quote does. Whether `growsIn` needs a
  qualifier for this ("observed by growers" vs "native range") is worth deciding before building it.
- **Flags stick.** A censored inference stays censored across re-runs (`shouldAssert`), and
  verdicts feed the evaluation sets (`link-inference.evaluation-set.ts`).
- **Confirming is asserting.** A person who agrees with an inferred value asserts it in the form;
  both claims then attest one value, and the person's ranks first.

## Legacy data

Legacy attributes are people's claims. The migration already rebuilds each article's history from
Gel's edits, with who made each one and who reviewed it (`wiki-migration-history.ts`), so each
legacy edit becomes a changeset of approved person claims. Values the migration derives from
what a person wrote are that person's claims too: ISBNs and Google Books IDs parsed from a
resource's URL, authors split from its credit line. Two details fit the schemas as they are:

- **No author on record:** `authorId` is null, as for deleted accounts. The preview import
  attributes these to a "Migration import" profile, which claims would no longer need.
- **No reviewer on record:** the evaluation is `APPROVED` with a null `evaluatedById`.

Tags migrate the same way: each tag becomes an approved person claim on `relatedTo`, by whoever
tagged (a note's owner, a resource's or plant's editor). People may assert `relatedTo` when they
know two articles relate but not how; the form should offer a typed relation first. This
reverses AGENTS.md's "links are never edited by hand" for this one property, which it would need
to say if the design is adopted. Notes' tags (`publication_wiki_articles`) are the same case,
once publications are subjects.

There's no legacy source left. One import that isn't legacy at all:

- **Wikidata IDs for legacy plants** (`gel-vegetable-wikidata-ids.ts`). They were researched during
  the migration and reviewed by the owner, so they're the owner's approved claims.

## Deep modules

Ousterhout's measure is a small interface hiding a lot. Here there are three interfaces, and
everything else (claim tables, statuses, evidence, source order, extraction, the edit diff) stays
behind them:

1. **Defining a property.** A `defineProperty` call says what the value is, which kinds have it,
   who may assert it and how providers supply it. It's the only code a new attribute needs in the
   domain, besides its line in the web app's presentation registry.
2. **Reading an article.** `ResolvedArticle<Kind>`: every value is a `ResolvedValue`, with the same
   shape whatever its source. Attestations carry just enough for a badge ("from GBIF", "suggested
   automatically"), a link and a flag button; the evidence (quote, rationale, observation) is
   fetched when someone opens it.
3. **Editing an article.** The form sends a **draft** per property and language, plus text
   revisions and a summary, as one changeset. The server turns drafts into claims
   (`editing.ts`): new values are asserted, people's values missing from the draft are retracted.
   The form never sees claims.

For people, this gives one mental model: **every fact shows where it came from; you can fix what
people wrote, and flag what machines found.** In the form, values from other sources are
read-only, with a flag button. Retracting a provider's value would be undone by its next refresh,
whereas a censored value stays censored (`shouldAssert`).

The API follows the same three interfaces:

- `GET` an article returns the resolved article.
- `GET` a claim's evidence fills the details panel.
- `POST` a changeset submits drafts, text revisions and a summary.
- `POST` a flag reports an automatic claim.

## Editing UX and code

Editors belong to value shapes, not properties: about a dozen components cover all 54 properties.

| Editor | Properties |
| --- | --- |
| Identifier input | `wikidataId`, `googleBooksVolumeId`, `gbifTaxonId`… |
| URL | `website`, `resourceUrl` |
| Single choice | `organizationType`, `placeKind`, `resourceFormat` |
| Chip set of choices | `strata`, `edibleParts`, `toolUsage`… |
| Range: two inputs, one schema message | `height`, `temperature`, `developmentCycle` |
| Partial dates, single or paired | `publicationDate`, `lifespan`, `activePeriod` |
| Ordered names per language | `label`, `aliases` (to become `names`) |
| Article or name picker | `publisher`, `basedIn`, `filmGenres`… |
| Ordered credits | `bookAuthors`, `filmDirectors` |
| Relation, with qualifier fields when it has any | `growsIn`, `containedByPlace`, `cultivarOf`, `relatedTo` |
| Media asset picker | `images`, `mainImage` |

The web app keeps a registry with an entry per `PropertyId`: title, description, section, and an
editor typed against the property's value. It fails to compile when a property is added without
one. A kind's form is its properties grouped by section; its state is a draft per property.

Names, per language tab: an ordered list, each with its grammatical gender. Values from Google
Books or the gazetteer show alongside, read-only. Scientific names are chips below, with GBIF's on
top. Languages without values show another language's, with a notice.

## Names

The intended direction, not built yet: one ordered list of **names** per language, replacing
`label` and `aliases`. No name is canonical; the first is the one most people recognize, and it
gives the article its handle, URL and default title. Readers may see another first, the name they
searched for ("maize" over "corn"), which is a read-time choice that doesn't change storage.

Why "names" over the alternatives:

- **Alias** presupposes a real name it stands in for, which is exactly the idea being rejected.
- **Common name** and **vernacular name** are botany's and zoology's terms for names that aren't
  scientific (GBIF calls them vernacular names), and fit plants and animals well. For a book, a
  place or a person they read oddly: nobody talks about a book's common name.
- **Names** is plain for every kind, and the web app can still label it per kind ("nomes
  populares" for plants).

It brings back what splitting removed:

- **`LIST` cardinality**, for people's order, with a fractional position per claim. Claims from
  other sources have no position of their own, so they follow people's in source order.
- **A minimum count**: "at least one name" in some language, like `presence: "REQUIRED"` for `ONE`
  properties.

## Open questions

- **Is a BOOK a work or an edition?** Today's attributes describe one edition (publisher, date,
  pages, edition label), while Google Books returns many (`bookEditions`).
- **Free text with no language.** `occupations`, `editionLabel` and `creditLine` are written in
  some language but stored per article. Each should either become `LANGUAGE_SPECIFIC` or point to
  CONCEPT articles.
- **Changing an article's kind.** Kind stays on the article row, not as a claim, since it decides
  which properties apply. Changing it orphans claims, so it should be a moderator's operation.
- **Publishing a new article.** It can't be published until required properties resolve, so its
  first changeset must include them. Places created by the gazetteer arrive with automatic
  claims.
- **Tied values from one source.** When several Google Books editions in one language assert
  different labels, resolution picks the newest. A provider-specific rule might do better.
- **Publications as subjects.** `publication_wiki_articles` would be the same claims about a
  publication. It's left out until generalizing subjects is worth it.
- **Downloaded provider media.** Every image is a media asset, providers' photos included: the
  fetch downloads them before extractors run (`DownloadedMedia`), so they're served at every size.
  Media assets can't hold them yet. `owner_profile_id` is required, so either it becomes nullable or
  a system profile owns imported media. Credits cover the credit line and source URL, but there's
  no license, which CC BY photos must show. Nothing records which provider URL an asset came from,
  which is needed to download each photo once and to keep it across refreshes.
- **Search.** Resolution runs per article on every claim change and materializes its output, as
  projections do today; the search columns would be built from resolved articles.
