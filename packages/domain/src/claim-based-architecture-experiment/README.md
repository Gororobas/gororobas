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
| **Source** | Who may assert a property: people, a provider, text inference… A property lists its sources in rank order. |
| **Provenance** | Where one claim came from: its source, and the evidence it had (`PersonProvenance`, `MachineProvenance`). People's claims are *reviewed*; machines' are *automatic*. |
| **Evaluation** | A moderator's verdict on something people submitted: a claim or a text revision. |
| **Moderation status** | Where a machine claim or machine translation stands: visible by default, censorable. |
| **Dispute** | A community member saying a machine claim is wrong. It never censors anything: it puts the claim in the moderation queue, where a moderator decides. |
| **Endorsement** | A community member saying "aye, looks right" about a claim without asserting it: "7 pessoas endossam". Not reviewed, withdrawable. |
| **Claimed value** | A value with the visible claim stating it: what resolution works with once approval, moderation, supersession and retraction are applied. |
| **Retraction** | A person's claim removing another person's claim once approved. |
| **Resolution** | Turning an article's claims into what readers see, per property and language. |
| **Resolved value** | A value as readers see it, with its **attestations**: every claim asserting it. |
| **Article text** | An article's rich text in one language: a Loro document, the only CRDT left. |
| **Text revision** | One Loro update to article text, from a frontier. "Revision" keeps today's meaning, scoped to text. |
| **Changeset** | What one person submits at once to one article: claims and text revisions, with a summary. Named after OpenStreetMap's. |

An article has one ordered list of **names** per language (see "Names" below). Scientific names
stay a property of their own: they name a taxon, belong to no language, and come mostly from GBIF.

`IMPLEMENTATION_PLAN.md` has the invariants, the SQL schema and the open design work for building
this; `test/claim-based-architecture-experiment/` runs the invariants the code already enforces.

## Decisions

**People are reviewed; machines are moderated.** The lifecycle follows the source, never the
property, and there are only two, so claims have two shapes (`claims.ts`) and invalid states
don't decode:

- a person's claim asserts or retracts, and has an `evaluation`;
- a machine claim asserts, and has a `moderationStatus`. It's never pending, and never retracts.

`Evaluation` is a tagged union, so an approved claim always says who approved it and when.

Machines never propose for review. Two cases looked like they needed it, and neither does:

- **Matching an article to a provider's record** (a Wikidata ID): the form offers a Wikidata search,
  through our API, and the person's choice is their claim. Articles machines create (places from
  the gazetteer) already come with Who's On First's Wikidata concordance. Searching automatically
  for articles without an ID wouldn't add much, and a one-off backfill can be reviewed by a person
  who then asserts the results.
- **Typed facts read from text** (`growsIn` from a publication): they're `ARTICLE_TEXT_INFERENCE`, like
  links. They show with a notice and their quote, can be disputed, and rank after people's claims.
  A property that shouldn't take a machine's reading at all leaves `ARTICLE_TEXT_INFERENCE` out of its
  sources.

**Properties list their sources, best first.** `sources` builds the list with a typed builder
(`sources.ts`), and the order is resolution's ranking. Restricting is common: identifiers never
come from text inference, providers never assert `growsIn`, only GBIF classifies taxa. Each
provider a property lists says how to read it, in plain code over the provider's result
(`providers/wikidata.ts` has Wikidata's readers, `providers/syntropedia.ts` Syntropedia's):

```ts
sources: (source) => [
  source.person(),
  source.wikidata({
    extract: (entity, context) =>
      Wikidata.statements(entity, WikidataProperty.AUTHOR).map((statement) =>
        Result.flatMap(Wikidata.articleOrName(statement, { context, language: "pt" }), source.found),
      ),
  }),
  source.articleTextInference(),
]
```

Guarantees that follow:

- **Types:** `extract` returns the property's value type, and `source.found` takes a language
  only for language-specific properties.
- **Claim types:** a property's `Claim` only takes the sources it lists. `cultivarOf`'s claims
  are all a person's (`checks.ts`; `ClaimOf` drops the claim shape a property's sources rule out).
- **Runtime:** a claim from an unlisted source doesn't decode, and every extracted value is checked
  against the value schema, deduplicated, and reported as ambiguous when a `ONE` property gets
  several in one language.

A source definition says how a source asserts values; a claim's **provenance** records which
source asserted it, with its evidence.

**Properties publish as schema.org** (`schemaOrg`, with SKOS's match strengths), which
`json-ld.ts` turns into an article page's JSON-LD. Properties without a match are agroecology's own
knowledge: strata, planting methods, edible parts.

**Changesets stay.** Grouping by author and evaluation can't replace them. Two edits made days
apart would merge, a group would split as its parts get evaluated, and deleted authors would all
merge into one. A changeset also carries the summary ("from Embrapa's 2019 booklet"), links
claims with the text revisions submitted alongside them, and can be reverted as one.

**Invariants spanning fields are one value.** Examples: `height` (and every range), `activePeriod`,
`lifespan`, `contentChannels`. Evaluating claims one by one then can't accept half of an
invariant.

**Order lives on people's claims.** `LIST` properties (`names`, `scientificNames`, `authors`,
`directors`) give each person's claim a fractional position (`values/fractional-index.ts`): a
key that always fits between two others, so moving a value supersedes only that value's claim.
Values only other sources assert follow people's, in source order.

**Equality comes from value schemas.** Two claims attest one value when the value schema's
equivalence (`Schema.toEquivalence`) says so, and readers see the best-ranked claim's version. A
schema folds only what readers don't distinguish: names compare case- and accent-folded
(`FoldedName`), ISBNs by their digits. A different gender or nativity is a
different value, so correcting one is always a change.

**Edits change only what the form showed.** The form sends the IDs of the people's claims it
showed with the draft (`editing.ts`). Values missing from the draft retract only those claims, and
if one of them no longer shows, the diff reports the form stale instead of guessing.

**Retracting undoes.** Claims are settled newest first (`resolution.ts`), so retracting a claim
that superseded another brings the other back, and reverting a changeset is retracting its claims.

**Cultivars inherit by listing traits.** Today every cultivar attribute is wrapped in
`Unknown | Inherit | Value`. Now `inheritsFromParent` lists the traits shown from the plant, a
trait with its own claims shows those, and a trait with neither is unknown. Plant properties stay
plain.

**Article text is not a claim.** It's one Loro document per article and language, so a
translation never conflicts with an edit in another language. Peritext merges pending revisions,
and node IDs stay stable for evidence. Text revisions use the same two lifecycles as claims:
people's are evaluated, machine translations are moderated. Entity references in the text become
`ARTICLE_TEXT_ENTITY_REFERENCE` claims, replaced whenever the text changes. I'd keep CRDTs over OT here:
OT's appeal is a central server ordering operations, but pending revisions sit for days on old
frontiers, which is exactly what CRDT merging handles and OT makes you rebase.

## Article text inference

One workflow reads publications and article text, and asserts two kinds of claims, both
`ARTICLE_TEXT_INFERENCE`: links (`relatedTo`, and publications' links to articles) and typed facts.
"O mamão até que cresce bem no Cerrado" becomes a `growsIn` claim on the papaya article pointing
to the Cerrado, with the quote and the publication as evidence. This is the basis for extracting
structured knowledge from publications. Things it should handle:

- **Attestations add up.** Three publications saying papaya grows in the Cerrado are three claims
  attesting one value: readers see "mentioned in 3 publications", which says more than one person's
  claim would.
- **Hedges and experiences.** "Até que cresce bem" is one grower's experience, not a botanical
  fact. The value doesn't say so; the attestation's quote does. Whether `growsIn` needs a
  qualifier for this ("observed by growers" vs "native range") is worth deciding before building it.
- **Censoring sticks to the evidence.** A censored inference stays out of re-runs reading the same
  text (`isAllowedToAssert`), while other publications saying the same thing still count, and
  verdicts feed the evaluation sets (`link-inference.evaluation-set.ts`).
- **Endorsing.** A person who agrees with an inferred value endorses it ("7 pessoas endossam"),
  or asserts it in the form, which makes it theirs too: reviewed, ranked first, and kept if the
  machine's claim is censored.

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
   automatically"), a link, who endorses and disputes it, and a dispute button; the evidence (quote, rationale, observation) is
   fetched when someone opens it.
3. **Editing an article.** The form sends a **draft** per property and language, plus text
   revisions and a summary, as one changeset. The server turns drafts into claims
   (`editing.ts`): new values are asserted, people's values missing from the draft are retracted.
   The form never sees claims.

For people, this gives one mental model: **every fact shows where it came from; you can fix what
people wrote, and endorse or dispute what machines found.** In the form, values from other sources
are read-only, with endorse and dispute buttons. Retracting a provider's value would be undone by
its next refresh, whereas a value censored from that provider stays out (`isAllowedToAssert`).

The API follows the same three interfaces:

- `GET` an article returns the resolved article.
- `GET` a claim's evidence fills the details panel.
- `POST` a changeset submits drafts, text revisions and a summary.
- `POST` a dispute sends a machine claim to the moderation queue; `POST`/`DELETE` an
  endorsement endorses a claim or withdraws the endorsement.

## Editing UX and code

Editors belong to value shapes, not properties: about a dozen components cover all 65 properties.

| Editor | Properties |
| --- | --- |
| Identifier input | `wikidataId`, `googleBooksVolumeId`, `gbifTaxonId`… |
| URL | `website`, `resourceUrl` |
| Single choice | `organizationType`, `placeKind`, `growthForm`, `successionalGroup`… |
| Chip set of choices | `strata`, `edibleParts`, `toolUsage`… |
| Range: two inputs, one schema message | `height`, `crownDiameter`, `temperature`, `developmentCycle` |
| Partial dates, single or paired | `datePublished`, `lifespan`, `activePeriod` |
| Ordered names per language | `names` |
| Article or name picker | `publisher`, `basedIn`, `genres`… |
| Ordered credits | `authors`, `directors` |
| Relation, with qualifier fields when it has any | `growsIn`, `containedInPlace`, `cultivarOf`, `relatedTo` |
| Media asset picker | `images`, `mainImage` |

The web app keeps a registry with an entry per `PropertyId`: title, description, section, and an
editor typed against the property's value. It fails to compile when a property is added without
one. A kind's form is its properties grouped by section; its state is a draft per property.

Names, per language tab: an ordered list, each with its grammatical gender. Values from Google
Books or the gazetteer show alongside, read-only. Scientific names are chips below, with GBIF's on
top. Languages without values show another language's, with a notice.

## Names

One ordered list of **names** per language (`properties/names.ts`), today's `commonNames`. No name
is canonical; the first is the one most people recognize, and it's the default title. Readers may
see another first (the name they searched for, "maize" over "corn"), chosen when reading. The
article's handle comes from the first name people gave (or the gazetteer's), never a machine's,
and is never replaced.

Why "names" over the alternatives:

- **Alias** presupposes a real name it stands in for, which is exactly the idea being rejected.
- **Common name** and **vernacular name** are botany's and zoology's terms for names that aren't
  scientific (GBIF calls them vernacular names), and fit plants and animals well. For a book, a
  place or a person they read oddly: nobody talks about a book's common name.
- **Names** is plain for every kind, and the web app can still label it per kind ("nomes
  populares" for plants).

It's a `LIST`, ordered by people, and `REQUIRED`, so an article always keeps a name in some
language.

## Open questions

- **Is a BOOK a work or an edition?** Today's attributes describe one edition (publisher, date,
  pages, edition label), while Google Books returns many (`bookEditions`).
- **Free text with no language.** `occupations`, `editionLabel` and `creditText` are written in
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
- **Search.** Resolution runs per article on every claim change and materializes its output, as
  projections do today; the search columns would be built from resolved articles.
