/**
 * A claim's provenance: who asserted it, and the evidence they had (W3C PROV's term for it). It
 * names one of the property's sources (a `ProvenanceSourceKey`) and records what that source read, so it's
 * the record of where the data came from, not the source's definition. It decides the claim's
 * lifecycle (see `claims.ts`):
 *
 * - People's claims are reviewed: pending until someone with `content:moderate` evaluates them,
 *   like wiki revisions today.
 * - Machines' claims are automatic: visible by default with a notice, disputable and censorable,
 *   the moderation lifecycle publications already have. Providers, text inference, machine
 *   translation, references in article text.
 *
 * Machines never propose for review. When a machine's answer is too risky to show, the property
 * leaves that source out of its `sources`. When a machine helps a person decide (a Wikidata search
 * box in the form), the person's choice is the claim.
 */
import { Schema } from "effect"

import { SupportedLanguage } from "../common/enums.js"
import {
  ExternalDataObservationId,
  PersonId,
  PublicationId,
  TiptapNodeId,
  WikiArticleId,
} from "../common/ids.js"
import { LanguageModelInfo } from "../links/domain.js"
import { Provider } from "./providers/index.js"

export const ClaimId = Schema.String.pipe(Schema.brand("ClaimId"))
export type ClaimId = typeof ClaimId.Type

export const ChangesetId = Schema.String.pipe(Schema.brand("ChangesetId"))
export type ChangesetId = typeof ChangesetId.Type

/** A node in some text: where a quote was found or a reference placed. */
export const TextLocation = Schema.TaggedUnion({
  ARTICLE_TEXT: { wikiArticleId: WikiArticleId, language: SupportedLanguage, nodeId: TiptapNodeId },
  PUBLICATION: { publicationId: PublicationId, nodeId: TiptapNodeId },
})

export type TextLocation = typeof TextLocation.Type

export const PersonProvenance = Schema.TaggedStruct("PERSON", {
  changesetId: ChangesetId,
  /**
   * Null once the author deletes their account (the claim outlives them), or for legacy edits
   * Gel didn't record an author for.
   */
  authorId: Schema.NullOr(PersonId),
})

export type PersonProvenance = typeof PersonProvenance.Type

export const MachineProvenance = Schema.TaggedUnion({
  EXTERNAL_PROVIDER: {
    provider: Provider,
    /** The raw response stays in the observation log, so claims stay small. */
    observationId: ExternalDataObservationId,
  },
  MACHINE_TRANSLATION: { model: LanguageModelInfo, translatedFrom: ClaimId },
  /**
   * A model reading text: today's link inference (`MENTION` and `INFERENCE`), and the typed facts
   * it can read alongside links ("o mamão cresce bem no Cerrado" → `growsIn`). Which properties
   * accept it is each property's choice.
   */
  ARTICLE_TEXT_INFERENCE: {
    model: Schema.NullOr(LanguageModelInfo),
    version: Schema.String,
    location: TextLocation,
    quote: Schema.NonEmptyString,
    /** Absent when the text names the article, so the quote is the evidence. */
    rationale: Schema.NullOr(Schema.NonEmptyString),
  },
  /**
   * An `entityReference` node a person placed in article text: replaced whenever that text
   * changes, never reviewed on its own, since the text revision was. Today's `ENTITY_REFERENCE`.
   */
  ARTICLE_TEXT_ENTITY_REFERENCE: { location: TextLocation },
})

export type MachineProvenance = typeof MachineProvenance.Type

/** The machine provenances a property's sources allow: providers narrowed to those listed. */
export type AllowedMachineProvenance<Source extends ProvenanceSourceKey> =
  | Extract<MachineProvenance, { readonly _tag: Extract<Source, MachineProvenance["_tag"]> }>
  | ([Extract<Source, Provider>] extends [never]
      ? never
      : Extract<MachineProvenance, { readonly _tag: "EXTERNAL_PROVIDER" }> & {
          readonly provider: Extract<Source, Provider>
        })

export type AllowedPersonProvenance<Source extends ProvenanceSourceKey> = "PERSON" extends Source
  ? PersonProvenance
  : never

/**
 * What a property's `sources` lists, in resolution order. Providers count individually, so
 * `strata` can trust Syntropedia over people while `names` trusts people over Google Books.
 */
export type MachineProvenanceKey =
  | Exclude<MachineProvenance["_tag"], "EXTERNAL_PROVIDER">
  | Provider

export type ProvenanceSourceKey = PersonProvenance["_tag"] | MachineProvenanceKey

export const sourceKeyOfMachineProvenance = (
  provenance: MachineProvenance,
): MachineProvenanceKey =>
  MachineProvenance.guards.EXTERNAL_PROVIDER(provenance) ? provenance.provider : provenance._tag
