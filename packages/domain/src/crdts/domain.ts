import { Schema } from "effect"

import { PersonId } from "../common/ids.js"

export const LoroDocUpdate = Schema.Uint8Array.pipe(Schema.brand("LoroCrdtUpdateEncoded"))
export type LoroDocUpdate = typeof LoroDocUpdate.Type

export const LoroDocSnapshot = Schema.Uint8Array.pipe(Schema.brand("LoroDocSnapshotEncoded"))
export type LoroDocSnapshot = typeof LoroDocSnapshot.Type

export const LoroDocFrontier = Schema.Array(
  Schema.Struct({
    peer: Schema.TemplateLiteral([Schema.Number]),
    counter: Schema.Finite,
  }),
).pipe(Schema.brand("LoroDocFrontier"))

export type LoroDocFrontier = typeof LoroDocFrontier.Type

export const HumanCommit = Schema.TaggedStruct("HumanCommit", {
  personId: PersonId,
})
export type HumanCommit = typeof HumanCommit.Type

export const SystemCommit = Schema.TaggedStruct("SystemCommit", {
  workflowName: Schema.String,
  workflowVersion: Schema.String,
  model: Schema.String,
})

export type SystemCommit = typeof SystemCommit.Type

export const CrdtCommit = Schema.Union([HumanCommit, SystemCommit])
export type CrdtCommit = typeof CrdtCommit.Type

export const CrdtCommitEncoded = Schema.fromJsonString(CrdtCommit)
