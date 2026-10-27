/**
 * Link inference: finds the wiki articles a text is about, with the evidence of where.
 *
 * 1. Mention detection: a dictionary pass finds exact names of existing articles, and a language
 *    model finds names it can't (synonyms, regional names, inflections).
 * 2. Implicit linking: the language model finds what the text implies without naming it.
 * 3. Candidate generation: every quoted span and the names the model proposes for it are looked
 *    up among the names of existing articles (`AliasIndex`).
 * 4. Disambiguation: a span matching several articles goes back to the model with the candidates.
 *
 * Spans that match no article become suggestions (NIL, in entity-linking terms).
 */
import {
  type AliasIndex,
  EvidenceLocation,
  groundSpan,
  type InferenceEvidence,
  type InferredLink,
  type InferredLinks,
  LinkInferenceModel,
  type LinkInferenceRequest,
  type MentionEvidence,
  type ModelExtraction,
  type SourceText,
  SuggestedWikiArticle,
  type WikiArticleCandidate,
  type WikiArticleId,
} from "@gororobas/domain"
import {
  Array as EffectArray,
  Effect,
  Option,
  Record,
  Schema,
  String as EffectString,
} from "effect"

interface MentionClaim {
  readonly source: "MENTION"
  readonly evidence: MentionEvidence
  /** Names proposed by the model; `null` for dictionary matches, which can't go unmatched. */
  readonly names: ModelExtraction["names"] | null
  readonly candidates: ReadonlyArray<WikiArticleCandidate>
  /** Where the span starts in the source text. */
  readonly offset: number
}

interface InferenceClaim {
  readonly source: "INFERENCE"
  readonly evidence: InferenceEvidence
  readonly names: ModelExtraction["names"]
  readonly candidates: ReadonlyArray<WikiArticleCandidate>
  readonly offset: number
}

type Claim = MentionClaim | InferenceClaim
type ResolvedClaim = Claim & { readonly wikiArticleId: WikiArticleId }

/** Characters around a span that show a model what it refers to. */
const PASSAGE_RADIUS = 300

const passageAround = (source: SourceText, claim: Claim) =>
  source.text
    .slice(
      Math.max(claim.offset - PASSAGE_RADIUS, 0),
      claim.offset + claim.evidence.text.length + PASSAGE_RADIUS,
    )
    .trim()

const dedupeCandidates = (candidates: ReadonlyArray<WikiArticleCandidate>) =>
  EffectArray.dedupeWith(candidates, (left, right) => left.wikiArticleId === right.wikiArticleId)

const encodeLocation = Schema.encodeSync(Schema.fromJsonString(EvidenceLocation))

const evidenceKey = ({ location, text }: MentionEvidence | InferenceEvidence) =>
  `${encodeLocation(location)}:${text}`

export const inferLinks = Effect.fn("inferLinks")(function* (
  request: LinkInferenceRequest & {
    readonly aliases: AliasIndex
    /** The linking article itself, which shouldn't link to itself. */
    readonly exclude: Option.Option<WikiArticleId>
  },
) {
  const model = yield* LinkInferenceModel
  const { source, aliases } = request

  const lookupNames = (names: ModelExtraction["names"]) =>
    [...names.pt, ...names.es, ...names.en].flatMap(aliases.lookup)

  const dictionaryClaims = aliases.scan(source.text).flatMap((occurrence): Array<Claim> =>
    Option.toArray(groundSpan(source, occurrence)).map((grounded) => ({
      source: "MENTION",
      evidence: { location: grounded.location, text: grounded.text },
      names: null,
      candidates: occurrence.candidates,
      offset: occurrence.start,
    })),
  )

  const groundExtraction = (extraction: ModelExtraction) =>
    Option.fromNullishOr(extraction.interval).pipe(
      Option.flatMap((interval) =>
        groundSpan(source, interval).pipe(
          Option.map((grounded) => ({
            offset: interval.start,
            evidence: {
              ...grounded,
              ...(extraction.alignmentStatus === null
                ? {}
                : { alignmentStatus: extraction.alignmentStatus }),
            },
          })),
        ),
      ),
    )

  const [mentions, inferences] = yield* Effect.all(
    [model.detectMentions(request), model.detectInferences(request)],
    { concurrency: 2 },
  )

  const mentionClaims = mentions.flatMap((extraction): Array<Claim> =>
    Option.toArray(groundExtraction(extraction)).map(({ offset, evidence }) => ({
      source: "MENTION",
      evidence,
      offset,
      names: extraction.names,
      candidates: dedupeCandidates([
        ...aliases.lookup(evidence.text),
        ...lookupNames(extraction.names),
      ]),
    })),
  )

  const inferenceClaims = inferences.flatMap((extraction): Array<Claim> =>
    Option.all({
      grounded: groundExtraction(extraction),
      rationale: Option.fromNullishOr(extraction.rationale),
    }).pipe(
      Option.toArray,
      EffectArray.map(({ grounded, rationale }) => ({
        source: "INFERENCE",
        evidence: { ...grounded.evidence, rationale },
        offset: grounded.offset,
        names: extraction.names,
        candidates: dedupeCandidates(lookupNames(extraction.names)),
      })),
    ),
  )

  const resolved = yield* Effect.forEach(
    [...dictionaryClaims, ...mentionClaims, ...inferenceClaims],
    (claim) =>
      EffectArray.match(claim.candidates, {
        onEmpty: () => Effect.succeed(Option.none<WikiArticleId>()),
        onNonEmpty: (nonEmpty) =>
          nonEmpty.length === 1
            ? Effect.succeed(Option.some(nonEmpty[0].wikiArticleId))
            : model.disambiguate({
                text: claim.evidence.text,
                passage: passageAround(source, claim),
                candidates: nonEmpty,
              }),
      }).pipe(
        Effect.map((wikiArticleId) => ({
          claim,
          // Self-mentions are resolved claims, not suggestions for a missing article.
          isAboutItself: Option.exists(wikiArticleId, (id) => Option.contains(request.exclude, id)),
          wikiArticleId: Option.filter(
            wikiArticleId,
            (id) => !Option.contains(request.exclude, id),
          ),
        })),
      ),
    { concurrency: 2 },
  )

  const links = groupLinks(
    resolved.flatMap(({ claim, wikiArticleId }) =>
      Option.toArray(wikiArticleId).map((id): ResolvedClaim => ({ ...claim, wikiArticleId: id })),
    ),
  )

  const suggestions = groupSuggestions(
    resolved.flatMap(({ claim, wikiArticleId, isAboutItself }) =>
      Option.isNone(wikiArticleId) && !isAboutItself ? [claim] : [],
    ),
  )

  return { links, suggestions } satisfies InferredLinks
})

const dedupeEvidence = <E extends MentionEvidence | InferenceEvidence>(
  evidence: EffectArray.NonEmptyReadonlyArray<E>,
) => EffectArray.dedupeWith(evidence, (left, right) => evidenceKey(left) === evidenceKey(right))

const isMentionClaim = <C extends Claim>(claim: C): claim is C & MentionClaim =>
  claim.source === "MENTION"

const isInferenceClaim = <C extends Claim>(claim: C): claim is C & InferenceClaim =>
  claim.source === "INFERENCE"

/** One link per article and source, with all its evidence. */
const groupLinks = (claims: ReadonlyArray<ResolvedClaim>): ReadonlyArray<InferredLink> => [
  ...Record.values(
    EffectArray.groupBy(claims.filter(isMentionClaim), (claim) => claim.wikiArticleId),
  ).map((group): InferredLink => ({
    wikiArticleId: group[0].wikiArticleId,
    source: "MENTION",
    evidence: dedupeEvidence(EffectArray.map(group, (claim) => claim.evidence)),
  })),
  ...Record.values(
    EffectArray.groupBy(claims.filter(isInferenceClaim), (claim) => claim.wikiArticleId),
  ).map((group): InferredLink => ({
    wikiArticleId: group[0].wikiArticleId,
    source: "INFERENCE",
    evidence: dedupeEvidence(EffectArray.map(group, (claim) => claim.evidence)),
  })),
]

const suggestedNames = (names: ModelExtraction["names"]) =>
  Option.all({
    pt: EffectArray.head(names.pt),
    es: EffectArray.head(names.es),
    en: EffectArray.head(names.en),
  }).pipe(Option.filter(({ pt, es, en }) => [pt, es, en].every(EffectString.isNonEmpty)))

/** Unmatched claims about the same thing, by its proposed English name, become one suggestion. */
const groupSuggestions = (unmatched: ReadonlyArray<Claim>): ReadonlyArray<SuggestedWikiArticle> => {
  const named = unmatched.flatMap((claim) =>
    Option.fromNullishOr(claim.names).pipe(
      Option.flatMap(suggestedNames),
      Option.map((names) => ({ ...claim, suggested: names })),
      Option.toArray,
    ),
  )

  const byName = (claim: (typeof named)[number]) => claim.suggested.en.toLowerCase()

  return [
    ...Record.values(EffectArray.groupBy(named.filter(isMentionClaim), byName)).map(
      (group): SuggestedWikiArticle => ({
        names: group[0].suggested,
        source: "MENTION",
        evidence: dedupeEvidence(EffectArray.map(group, (claim) => claim.evidence)),
      }),
    ),
    ...Record.values(EffectArray.groupBy(named.filter(isInferenceClaim), byName)).map(
      (group): SuggestedWikiArticle => ({
        names: group[0].suggested,
        source: "INFERENCE",
        evidence: dedupeEvidence(EffectArray.map(group, (claim) => claim.evidence)),
      }),
    ),
  ]
}
