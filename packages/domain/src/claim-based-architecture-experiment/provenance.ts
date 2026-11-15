/**
 * Where a claim came from. It names one of the property's sources (a `ProvenanceSourceKey`) and
 * records what that source had to go on, so it's the record of where the data came from, not the
 * source's definition.
 *
 * - A person's claim records who made it. On a canonical property it's a proposal a curator
 *   evaluates; on a situated property it's that person's say, visible at once, made on the
 *   article (direct) or read from their publication (inferred); `claims.ts` records how they
 *   know and where it holds.
 * - A machine's claim records what it read: a provider's record, the claim a translation
 *   translates, or the node of article text where a person placed an entity reference.
 *
 * Machines never propose for review, and never infer canonical properties from text. What a
 * machine reads from someone's publication is that person's situated claim, marked as inferred.
 */
import { Schema } from "effect"

import { SupportedLanguage } from "../common/enums.js"
import { PersonId, PublicationId, TiptapNodeId, WikiArticleId } from "../common/ids.js"
import { ExternalDataObservationId } from "../common/ids.js"
import { LanguageModelInfo } from "../links/domain.js"
import { Provider } from "./providers/index.js"

export const ClaimId = Schema.String.pipe(Schema.brand("ClaimId"))
export type ClaimId = typeof ClaimId.Type

/** A node in some text: where an entity reference was placed or an inferred claim was read. */
export const TextLocation = Schema.TaggedUnion({
  ARTICLE_TEXT: { wikiArticleId: WikiArticleId, language: SupportedLanguage, nodeId: TiptapNodeId },
  PUBLICATION: { publicationId: PublicationId, nodeId: TiptapNodeId },
})

export type TextLocation = typeof TextLocation.Type

export const PersonProvenance = Schema.TaggedStruct("PERSON", {
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
 * What a property's sources name. Providers count individually, so `crownShape` can trust
 * Syntropedia over people while `mostCommonlyKnownAs` trusts people over Google Books.
 */
export type MachineProvenanceKey =
  | Exclude<MachineProvenance["_tag"], "EXTERNAL_PROVIDER">
  | Provider

export type ProvenanceSourceKey = PersonProvenance["_tag"] | MachineProvenanceKey

export const sourceKeyOfMachineProvenance = (
  provenance: MachineProvenance,
): MachineProvenanceKey =>
  MachineProvenance.guards.EXTERNAL_PROVIDER(provenance) ? provenance.provider : provenance._tag
