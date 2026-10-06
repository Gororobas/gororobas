import { Effect, Schema } from "effect"
import { type LoroDoc } from "loro-crdt"

import { CrdtCommit, LoroDocFrontier, LoroDocSnapshot, LoroDocUpdate } from "./domain.js"
import { InvalidCrdtUpdateError } from "./errors.js"
import {
  applyCrdtUpdateWithCommit,
  loroDocToSnapshot,
  loroDocToUpdate,
  parseCrdtUpdate,
  snapshotToLoroDoc,
  validateCrdtDocument,
} from "./lib.js"

/** Shares validation and publication semantics while leaving container layout to each model. */
export const defineCrdtDocument = <
  S extends Schema.ConstraintDecoder<unknown, never>,
  Edit,
  E,
>(configuration: {
  schema: S
  createDocument: (data: S["Type"]) => Effect.Effect<LoroDoc, E>
  // oxlint-disable-next-line effect/no-unknown-returns -- Projections are untrusted until decoded by the model schema.
  projectDocument: (document: LoroDoc) => unknown
  applyEdit: (document: LoroDoc, edit: Edit) => Effect.Effect<void, unknown>
}) => {
  const read = (document: LoroDoc) =>
    validateCrdtDocument({
      updatedDoc: document,
      targetSchema: configuration.schema,
      projectDocument: configuration.projectDocument,
    })

  const create = Effect.fn("CrdtDocument.create")(function* (sourceData: S["Type"]) {
    const document = yield* configuration.createDocument(sourceData)
    const data = yield* read(document)

    return {
      document,
      data,
      currentCrdtFrontier: LoroDocFrontier.make(document.frontiers()),
      crdtSnapshot: loroDocToSnapshot(document),
      initialCrdtUpdate: loroDocToUpdate(document),
    }
  })

  /** Validates an isolated import, retaining history for replay of already committed revisions. */
  const parseUpdate = (input: { crdtUpdate: LoroDocUpdate; snapshot: LoroDocSnapshot }) =>
    parseCrdtUpdate({
      ...input,
      sourceDocument: snapshotToLoroDoc(input.snapshot),
      targetSchema: configuration.schema,
      projectDocument: configuration.projectDocument,
    }).pipe(Effect.map(({ loroDoc, data }) => ({ document: loroDoc, data })))

  /** Validates and publishes only the final diff, with server attribution and a timestamp. */
  const applyUpdate = (input: {
    commit: CrdtCommit
    crdtUpdate: LoroDocUpdate
    snapshot: LoroDocSnapshot
  }) =>
    applyCrdtUpdateWithCommit({
      ...input,
      targetSchema: configuration.schema,
      projectDocument: configuration.projectDocument,
    }).pipe(Effect.map(({ cleanDoc, ...result }) => ({ ...result, document: cleanDoc })))

  /** Applies machine edits sequentially, then uses the same publication boundary as client updates. */
  const evolve = Effect.fn("CrdtDocument.evolve")(function* (input: {
    commit: CrdtCommit
    edits: ReadonlyArray<Edit>
    snapshot: LoroDocSnapshot
  }) {
    const current = snapshotToLoroDoc(input.snapshot)
    const edited = current.fork()
    yield* Effect.forEach(input.edits, (edit) => configuration.applyEdit(edited, edit), {
      concurrency: 1,
      discard: true,
    }).pipe(Effect.mapError(() => new InvalidCrdtUpdateError({ reason: "SchemaValidation" })))

    return yield* applyUpdate({
      commit: input.commit,
      snapshot: input.snapshot,
      crdtUpdate: LoroDocUpdate.make(edited.export({ from: current.version(), mode: "update" })),
    })
  })

  return {
    create,
    project: configuration.projectDocument,
    read,
    parseUpdate,
    applyUpdate,
    evolve,
    applyEdit: configuration.applyEdit,
  }
}
