# Claims experiment

Wiki articles as **claims** about **properties**, with rich text kept as **article text**. Nothing
imports this folder. `properties/` has one file per property: every attribute, translation field,
external projection and relation the wiki has today, plus `cultivationExperience` and
`mostCommonlyKnownAs`.

## Two kinds of property

A property's type (`propertyType`) says how its answer is settled:

- **Canonical** (58 properties): one answer the wiki holds. An identifier, a classification, a
  book's publication date, a plant's origin, its crown shape. Sources may disagree; the canonical
  answer comes from the most authoritative one, so a canonical property ranks its sources. People
  propose values and corrections, which a curator evaluates, and the answer is never final: anyone
  may propose a correction. Canonical properties are never inferred from text.
- **Situated** (18 properties): as many answers as people have experiences, because the answer
  depends on who, where and when. Days to harvest, strata, edible parts, names, how growing
  something went. Nobody reviews a situated claim before it shows, and nobody's outranks anyone's:
  the article shows a **summary** tallied from every claim, never a winner.

The situated ones are mostly plant traits (`strata`, `height`, `developmentCycle`, `edibleParts`,
`lifecycles`…), plus `toolUsage`, `cultivationExperience`, `names` and `images`. Animal ecological functions,
feeding behaviors, production systems and human uses are canonical sets.
More will come as each kind's domain is worked out; plants are just the furthest along. Botanical
facts stay canonical even when they look like traits: `crownShape`, `growthForm`, `seedDormancy`,
`seedStorageBehavior` and `leafPersistence`, with Syntropedia ranked above people.

```ts
// Canonical: sources ranked, best first.
sources: (source) => [
  source.syntropedia({ extract: (plant) => Option.toArray(Option.fromNullishOr(plant.crownShape)).map(source.found) }),
  source.person(),
]

// Situated: a claim's value is what its author gave (here, every stratum they saw), sources are
// named, unranked, and the summary says how claims are tallied.
valueSchema: NonEmptySet(AgroforestryStratum),
sources: (source) => ({
  syntropedia: source.syntropedia({
    extract: (plant) => Option.toArray(nonEmptySetOf(plant.strata)).map(source.found),
  }),
  person: source.person({ inferable: true }),
}),
summary: (summarize) => summarize.eachMember(AgroforestryStratum),
inheritance: { through: ["cultivarOf"], mode: "ALONGSIDE" },
```

## Vocabulary

| Term | Meaning |
| --- | --- |
| **Article** | The subject: a plant, a book, a place. |
| **Property** | What about the article: `isbn`, `height`, `strata` (`defineCanonicalProperty`, `defineSituatedProperty`). |
| **Canonical property** | One answer, from the most authoritative source; never final. |
| **Situated property** | Many answers, each with its context, tallied into a summary. |
| **Claim** | One source asserting one value of one property about one article. On a situated property, a person's claim is their say. |
| **Value** | What a claim asserts. On a situated property, everything its author gave at once: the set of strata they saw, the range of days they waited. Qualifiers are fields of the value (`cultivationExperience` → `{ place, outcome, wouldDoAgain }`). Two values are the same when the value schema's equivalence says so. |
| **Source** | Who may assert a property: people, a provider, entity references in article text, machine translation. A canonical property ranks its sources; a situated one names them. |
| **Provenance** | Where one claim came from: its source, and what that source read (`PersonProvenance`, `MachineProvenance`). |
| **Direct claim** | A person's situated claim, made on the article itself (`SituatedDirectClaim`). |
| **Inferred claim** | A person's situated claim a machine read from a **passage** of their own public publication: the quote readers can check (`SituatedInferredClaim`). Live at once, marked as inferred, counted; the author may confirm, fix or remove it. Only for properties whose person source is `inferable`, and only for people with community access. |
| **External source claim** | What a provider a situated property lists says (`SituatedExternalSourceClaim`): named in the summary, never counted among people. |
| **Context** | Where and when a situated claim holds: a place (from the profile, changeable per claim; only a region is ever shown) and, optionally, a period, which may be a single moment, a span or ongoing. |
| **Basis** (`ClaimBasis`) | How a person knows: their own experience, a published work (in the encyclopedia, at a link, or described), or someone else (a person on Gororobas, or described). Labelled per article kind ("vi ou plantei", "tenho o livro"). |
| **Note** and **attachments** | An optional line of text and up to four images on a situated claim: a caption, not a publication. It has no comments; discussion happens on publications. |
| **Summary** | What the article shows for a situated property, tallied by the property's **summary strategy**: whole values (`wholeValues`) or each member of a set (`eachMember`) with the number of people behind each and the sources naming it, most people first; or one range combined from everyone's (`range`), leaving out people's claims far from the rest (and saying which). Always with the total number of people. |
| **Proposal** | A person's claim on a canonical property: asserts or retracts a value, with an optional note, and waits for an evaluation. |
| **Evaluation** | A curator's verdict on a proposal or a text revision. |
| **Report** (`ClaimReport`) | Saying a claim is false, abusive, spam, off-topic or dangerous. Stored apart from the claim; a moderator settles a claim's reports together by censoring it or keeping it. Disagreeing is never a report: it's a claim (situated) or a proposal (canonical). |
| **Summary strategy** | How a situated property tallies its claims into the summary (`summary` in `defineSituatedProperty`): whole values, each member of a set, or one range combined from everyone's. |
| **Moderation status** | Whether a claim that shows by default (a machine's, or a situated person's) has been censored. |
| **Resolution** | Turning a canonical property's claims into what readers see, per language. |
| **Resolved value** | A canonical value as readers see it, with its **attestations**: every claim asserting it. |
| **Inheritance** | An article showing values of the articles it inherits from, through a relation (`cultivarOf`): a cultivar from its plant, later a breed from its species. Each property says whether and how (`ALONGSIDE` or `BY_CHOICE`). |
| **Ancestor** | An article another inherits from: a cultivar's plant. |
| **Most commonly known as** | The canonical name an article goes by in a language. Its handle is derived from it once, at creation. |
| **Article text** | An article's rich text in one language: a Loro document, the only CRDT left. |
| **Text revision** | One Loro update to article text, from a frontier. |

`IMPLEMENTATION_PLAN.md` has the invariants, the SQL schema and the open design work for building
this; `test/claim-based-architecture-experiment/` runs the invariants the code already enforces.

## Decisions

**The property, not the source, decides how a claim lives.** Claims have five shapes, all in
`claims.ts`, so invalid states don't decode:

| | Canonical | Situated |
| --- | --- | --- |
| A person's | a proposal: asserts or retracts, with a note, and has an `evaluation` | **direct** or **inferred** (with its passage): asserts, with context, basis, note and attachments, and has a `moderationStatus` |
| A machine's | asserts, and has a `moderationStatus` | **external source**: a provider's, asserts, and has a `moderationStatus` |

**A situated claim's value is what its author gave.** Joana picking two strata makes one claim
with both, carrying her context, basis and photos once. There's no cardinality: the property's
`summary` says how claims are tallied (`situated-summary.ts`). Sets are tallied member by member,
so "Baixo · 3 pessoas" counts everyone who listed it, whatever else they listed. Ranges combine
into one, from the lowest end to the highest, open where no claim gives an end. People's ranges
whose midpoint falls outside Tukey's fences (`common/statistics.ts`) are left out and listed, once
there are four or more; a source's are never left out.

**Situated summaries count people, not claims.** Joana saying in five posts and on the article
that carrots took 110 days is one person behind "110 days": claims group within a person, never
across people. A source is named beside the count ("Baixo · 3 pessoas e Syntropedia"), never added
to it. Ordering is by how many people, then how many sources, then how recently; nothing is
weighted, and readers filter by context and basis instead.

**Negatives are values, not stances.** There's no "no" on a claim. Where a "no" carries knowledge,
the value holds it (`cultivationExperience`'s outcome: it failed) or another property does (toxic
parts, next to edible parts). Everywhere else the count says it: "flor · 1 pessoa" beside "raiz ·
16 pessoas".

**Inference reads publications, never article text.** Article text is authored and reviewed, so
contributors state relations explicitly instead; entity references they place still become
`relatedTo` claims (`ARTICLE_TEXT_ENTITY_REFERENCE`). Inference only asserts situated properties
whose person source is `inferable`, and what it reads is the author's claim. It doesn't tell
variants apart yet: "minha cenoura levou 110 dias" lands on the carrot. A passage's value censored
by a moderator stays out of re-runs reading that passage (`isAllowedToInfer`), while other
passages saying the same still count. The server leaves out the inferred claims of people who've
lost community access.

**There are no changesets or endorsements.** Each proposal stands on its own, with its own note,
and is evaluated on its own; situated claims need no review at all. Text revisions are evaluated
one by one too. Agreeing with a canonical value is proposing it too ("GBIF e 4 pessoas"), and with
a situated one, making the same claim.

**Canonical properties list their sources, best first.** The order is resolution's ranking, and
`sources` builds the list with a typed builder (`sources.ts`). Each provider a property lists says
how to read it, in plain code over the provider's result (`providers/wikidata.ts` has Wikidata's
readers, `providers/syntropedia.ts` Syntropedia's, `providers/tmdb.ts` TMDB's). Guarantees:

- **Types:** `extract` returns the property's value type, and `source.found` takes a language
  only for language-specific properties. A canonical builder has no way to infer from text; a
  situated one has no machine translation or entity references.
- **Claim types:** a property's `Claim` only takes the sources it lists (`checks.ts`; `ClaimOf`
  drops the claim shape a property's sources rule out).
- **Runtime:** a claim from an unlisted source doesn't decode, an inferred claim of a property
  that isn't inferable doesn't decode, and every extracted value is checked against the value
  schema, deduplicated, and reported as ambiguous when a canonical `ONE` property gets several in
  one language.

**Properties publish as schema.org** (`schemaOrg`, with SKOS's match strengths), which
`json-ld.ts` turns into an article page's JSON-LD. Properties without a match are agroecology's own
knowledge: strata, planting methods, edible parts.

**Invariants spanning fields are one value.** Examples: `height` (and every range), `activePeriod`,
`lifespan`, `contentChannels`. On a situated range, a person may give a single number (`min` equal
to `max`), and the summary's range is built from everyone's.

**Order lives on people's proposals.** Canonical `LIST` properties (`authors`, `directors`) give
each proposal a fractional position (`values/fractional-index.ts`): a key that always fits between
two others, so moving a value supersedes only that value's claim. Values only other sources assert
follow people's, in source order. Situated properties have no lists.

**Equality comes from value schemas.** Two claims attest one value when the value schema's
equivalence (`Schema.toEquivalence`) says so. A schema folds only what readers don't distinguish:
names compare case- and accent-folded (`NameWithNormalizedEquivalence`), ISBNs by their digits. A different gender
or nativity is a different value.

**Edits change only what the form showed.** For canonical properties, the form sends the IDs of
the proposals it showed with the draft (`editing.ts`). Values missing from the draft retract only
those claims, and if one of them no longer shows, the diff reports the form stale instead of
guessing. Situated properties have no drafts: a person adds and removes their own claims.

**Retracting undoes.** Canonical claims are settled newest first (`resolution.ts`), so retracting
a claim that superseded another brings the other back.

**Each property decides how it inherits, not the kind** (`inheritance.ts`). A property lists the
relations it inherits through (`through: ["cultivarOf"]`) and a mode, and the article's shape
follows: `WithInherited` (own values, and each ancestor's) or `WithChosenInheritance` (adds whether
the article inherits). An article may have several ancestors, nearest first.

- `ALONGSIDE`, for situated properties: a cultivar's summary first and its plant's beneath,
  labelled as the plant's, never merged: "3 pessoas" always means three people talking about this
  cultivar.
- `BY_CHOICE`, for canonical ones (`crownShape`, `growthForm`…): the cultivar lists the property in
  `inheritedProperties` to show its plant's values; a property with its own claims shows those, and
  neither is unknown.

Breeds and places get the same by adding their relation to `InheritanceRelation` and to the
properties that should inherit through it.

**Article text is not a claim.** It's one Loro document per article and language, so a
translation never conflicts with an edit in another language. Peritext merges pending revisions,
and node IDs stay stable for evidence. People's text revisions are evaluated; machine translations
are moderated.

## Names

**Names** (`properties/names.ts`) are situated: one name in Colombia, another in Brazil, each with
the region it's used in, ordered by how many people use it. The name an article goes by is
**most commonly known as** (`properties/most-commonly-known-as.ts`), canonical and required, one
per language. It's not "the" name: a reader's region may make another one more familiar, and the
page can say so ("perto de você chamam de guamo"). It doesn't have to be among the names, and
JSON-LD leaves out an alternate name equal to it.

A new article needs only a kind, its most-commonly-known-as name, a handle derived from it (never
re-derived when it changes, so links keep working) and, optionally, its identifiers in external
providers, found by searching them from the form.

Scientific names aren't a property: they're read from GBIF's `taxonomicClassification` (its most
specific rank), which cultivars inherit from their plant. They name a taxon and belong to no
language, so GBIF is the authority, and people correct them by correcting the article's
`gbifTaxonId` or `wikidataId`.

## Legacy data

Legacy attributes are people's claims. The migration already rebuilds each article's history from
Gel's edits, with who made each one and who reviewed it (`wiki-migration-history.ts`). On canonical
properties each legacy edit becomes approved proposals; on situated ones, direct claims by the
edit's author, with no context or basis. Values the migration derives from what a person wrote
are that person's claims too: ISBNs and Google Books IDs parsed from a resource's URL, authors
split from its credit line. Two details fit the schemas as they are:

- **No author on record:** `authorId` is null, as for deleted accounts. The preview import
  attributes these to a "Migration import" profile, which claims would no longer need.
- **No reviewer on record:** the evaluation is `APPROVED` with a null `evaluatedById`.

Tags migrate the same way: each tag becomes an approved proposal on `relatedTo`, by whoever tagged
(a note's owner, a resource's or plant's editor). This reverses AGENTS.md's "links are never
edited by hand" for this one property, which it would need to say if the design is adopted.

Where today's attributes land, for the migration to follow:

| Property | Today |
| --- | --- |
| `inLanguage` | book `language`, film `languages` |
| `inheritedProperties` | the `CultivarProperty` wrapper (`Unknown \| Inherit \| Value`) on every cultivar attribute, turned inside out |
| `bookEditions` | `wiki_book_editions`, as Google Books lists them |
| `website` | optional `url` on books, films, entities and people (a resource's URL is `resourceUrl`) |
| `organizationType` | noteworthy entity `entityType` |
| `taxonomicClassification` | `wiki_plant_taxonomy_classification`, now for animals too |
| `relatedTo` | `wiki_article_relations` |
| `editionLabel` | book `edition` |
| `origin` | plant translation field `origin` |
| `creditText` | resource `creditLine` |
| `wikipediaPage` | `wiki_article_external_links`, Wikidata's sitelinks |
| `isbn` | `isbn10` and `isbn13` |
| `mainImage` | `wiki_article_main_media`; a provider's first photo stands in while the article has none, now just source order |
| `countryOfOrigin` | film `country`, free text |
| `datePublished` | `publicationDate` and `releaseDate` |
| `containedInPlace` | `parentPlaceId`, which now allows several parents |
| `basedIn` | noteworthy person `location`, free text |
| `height` | `heightMin` and `heightMax` |
| `taxonomyGroup` | `wiki_plant_taxonomy_group`, now for animals too |
| `names` | `WikiArticleCommonName` |
| `mostCommonlyKnownAs` | `commonNames` |
| `images` | `wiki_article_media_assets` and `wiki_article_external_media` |
| `cultivarOf` | `parentPlantId` |

Syntropedia IDs aren't backfilled by scientific name: a machine guess would be reviewed by a person who then asserts the results, so people match each plant to Syntropedia's.

One import that isn't legacy at all:

- **Wikidata IDs for legacy plants** (`gel-vegetable-wikidata-ids.ts`). They were researched during
  the migration and reviewed by the owner, so they're the owner's approved proposals.

## Deep modules

Ousterhout's measure is a small interface hiding a lot. Here there are three interfaces, and
everything else (claim tables, statuses, evidence, source order, extraction, the edit diff) stays
behind them:

1. **Defining a property.** A `defineCanonicalProperty` or `defineSituatedProperty` call says what
   the value is, which kinds have it, who may assert it and how providers supply it. It's the only
   code a new attribute needs in the domain, besides its line in the web app's presentation
   registry.
2. **Reading an article.** `ResolvedArticle<Kind>`: a canonical property gives `ResolvedValue`s
   with their attestations, a situated one the summary its strategy tallies, each with their
   ancestors' when the property inherits.
   Evidence (a quote, a basis, an observation) is fetched when someone opens a claim.
3. **Contributing.** A proposal on a canonical property, or a claim of your own on a situated one.

For people, this gives one mental model: **every value shows where it came from; on canonical
properties you propose corrections, on situated ones you add your own say.**

The API follows the same three interfaces:

- `GET` an article returns the resolved article.
- `GET` a claim's evidence fills the details panel; `GET` a situated property's claims lists who
  said what, filterable by context and basis.
- `POST` a proposal submits a canonical draft with its note.
- `POST`/`DELETE` a situated claim adds or removes your own; `POST` a confirmation or correction
  settles an inferred claim of yours.
- `POST` a report sends a claim to the moderation queue.

## Editing UX and code

Editors belong to value shapes, not properties: about a dozen components cover every property.

| Editor | Properties |
| --- | --- |
| Identifier input | `wikidataId`, `googleBooksVolumeId`, `gbifTaxonId`… |
| URL | `website`, `resourceUrl` |
| Single choice | `organizationType`, `placeKind`, `growthForm`, `successionalGroup`… |
| Chip set of choices | `strata`, `edibleParts`, `toolUsage`… |
| Number or range: two inputs, one schema message | `height`, `crownDiameter`, `temperature`, `developmentCycle` |
| Partial dates, single or paired | `datePublished`, `lifespan`, `activePeriod` |
| A name per language | `mostCommonlyKnownAs`, `names` |
| Article or name picker | `publisher`, `basedIn`, `genres`… |
| Ordered credits | `authors`, `directors` |
| Relation, with qualifier fields when it has any | `cultivationExperience`, `containedInPlace`, `cultivarOf`, `relatedTo` |
| Media asset picker | `images`, `mainImage` |

Situated properties wrap their editor with the claim's context (place, prefilled from the
profile), basis, note and attachments. The web app keeps a registry with an entry per
`PropertyId`: title, description, section, an optional notice (a caution on `edibleParts`), and an
editor typed against the property's value. It fails to compile when a property is added without
one.

## Open questions

- **Is a BOOK a work or an edition?** Today's attributes describe one edition (publisher, date,
  edition label), while Google Books returns many (`bookEditions`, each with its own page count).
- **Free text with no language.** `occupations`, `editionLabel` and `creditText` are written in
  some language but stored per article. Each should either become `LANGUAGE_SPECIFIC` or point to
  CONCEPT articles.
- **Changing an article's kind.** Kind stays on the article row, not as a claim, since it decides
  which properties apply. Changing it orphans claims, so it should be a moderator's operation.
- **Publishing a new article.** It can't be published until `mostCommonlyKnownAs` (and any other
  required property) resolves, so its first proposals must include it. Places created by the
  gazetteer arrive with automatic claims.
- **Tied values from one source.** When several Google Books editions in one language assert
  different labels, resolution picks the newest. A provider-specific rule might do better.
- **`cultivationExperience`'s scale.** Four outcomes and "would you do it again" are a first
  guess; whether it should widen into a review of tools, books and films is open.
- **Inferring variants.** Inferred claims land on the plant; telling cultivars apart in a post is
  left for later.
- **Publications as subjects.** `publication_wiki_articles` would be the same claims about a
  publication. It's left out until generalizing subjects is worth it.
- **Search.** Resolution and summaries run per article on every claim change and materialize
  their output, as projections do today; the search columns would be built from them.
