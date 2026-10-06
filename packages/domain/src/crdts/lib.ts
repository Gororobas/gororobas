import { Clock, Effect, Schema } from "effect"
import { LoroDoc, VersionVector } from "loro-crdt"
import { nanoid } from "nanoid"

import { LoroListItemId } from "../common/ids.js"
import {
  CrdtCommit,
  CrdtCommitEncoded,
  LoroDocFrontier,
  LoroDocSnapshot,
  LoroDocUpdate,
} from "../crdts/domain.js"
import { InvalidCrdtUpdateError } from "./errors.js"
export { createLoroDocFromData } from "./initialize-loro-document.js"

export function loroDocToSnapshot(doc: LoroDoc) {
  return doc.export({ mode: "snapshot" })
}

export function loroDocToUpdate(doc: LoroDoc) {
  return doc.export({
    from: new VersionVector(null),
    mode: "update",
  })
}

export function snapshotToLoroDoc(crdtBlob: LoroDocSnapshot): LoroDoc {
  const doc = new LoroDoc()
  doc.import(crdtBlob)
  return doc
}

/** Applies edits to an isolated fork, publishing only their final diff. */
export const modifyLoroDocWithCommit = Effect.fn("modifyLoroDocWithCommit")(function* <E, R>({
  initialDoc,
  modifyDoc,
  commit,
}: {
  initialDoc: LoroDoc
  modifyDoc: (startDoc: LoroDoc) => Effect.Effect<LoroDoc, E, R>
  commit: CrdtCommit
}) {
  const editedDoc = yield* modifyDoc(initialDoc.fork())

  const diff = editedDoc.diff(initialDoc.frontiers(), editedDoc.frontiers())

  const cleanFinalDocument = initialDoc.fork()
  cleanFinalDocument.applyDiff(diff)

  cleanFinalDocument.commit({
    message: yield* Schema.encodeEffect(CrdtCommitEncoded)(commit),
    timestamp: yield* Clock.currentTimeMillis,
  })

  return cleanFinalDocument
})

const applyUpdate = (crdtUpdate: Uint8Array<ArrayBufferLike>, sourceDocument: LoroDoc) =>
  Effect.try({
    try: () => {
      const forkedDoc = sourceDocument.fork()

      const importStatus = forkedDoc.import(crdtUpdate)

      if (
        !importStatus.success ||
        (importStatus.pending !== null && importStatus.pending.size > 0)
      ) {
        throw new InvalidCrdtUpdateError({ reason: "InvalidFormat" })
      }

      return forkedDoc
    },
    catch: () => new InvalidCrdtUpdateError({ reason: "InvalidFormat" }),
  })

/**
 * We use `onExcessProperty: error` when decoding the document to prevent incorporating malicious
 * data into our CRDT documents.
 */
export const validateCrdtDocument = <S extends Schema.ConstraintDecoder<unknown, never>>({
  updatedDoc,
  targetSchema,
  projectDocument,
}: {
  updatedDoc: LoroDoc
  targetSchema: S
  // oxlint-disable-next-line effect/no-unknown-returns -- CRDT projections remain untrusted until targetSchema decodes them; declaring a domain result here would bypass that validation.
  projectDocument: (document: LoroDoc) => unknown
}): Effect.Effect<S["Type"], InvalidCrdtUpdateError, never> =>
  Effect.try(() => projectDocument(updatedDoc)).pipe(
    // oxlint-disable-next-line custom-lint-rules/no-schema-decode-unknown -- Loro projections remain untrusted until the caller's schema validates them.
    Effect.flatMap(Schema.decodeUnknownEffect(targetSchema, { onExcessProperty: "error" })),
    Effect.mapError(() => new InvalidCrdtUpdateError({ reason: "SchemaValidation" })),
  )

export const parseCrdtUpdate = Effect.fn("parseCrdtUpdate")(function* <
  S extends Schema.ConstraintDecoder<unknown, never>,
>(props: {
  crdtUpdate: Uint8Array<ArrayBufferLike>
  targetSchema: S
  sourceDocument: LoroDoc
  // oxlint-disable-next-line effect/no-unknown-returns -- CRDT projections remain untrusted until targetSchema decodes them; declaring a domain result here would bypass that validation.
  projectDocument?: (document: LoroDoc) => unknown
}) {
  const updatedDoc = yield* applyUpdate(props.crdtUpdate, props.sourceDocument)

  const data = yield* validateCrdtDocument({
    updatedDoc: updatedDoc,
    targetSchema: props.targetSchema,
    projectDocument: props.projectDocument ?? ((document) => document.toJSON()),
  })

  return { data, loroDoc: updatedDoc }
})

/**
 * Applies the update ignoring intermediary values stored in the CRDT edit history (for storage size and user privacy)
 */
export const applyCrdtUpdateWithCommit = Effect.fn("applyCrdtUpdateWithCommit")(function* <
  S extends Schema.ConstraintDecoder<unknown, never>,
>({
  commit,
  crdtUpdate,
  targetSchema,
  snapshot,
  projectDocument,
}: {
  commit: CrdtCommit
  crdtUpdate: LoroDocUpdate
  targetSchema: S
  snapshot: LoroDocSnapshot
  // oxlint-disable-next-line effect/no-unknown-returns -- CRDT projections remain untrusted until targetSchema decodes them; declaring a domain result here would bypass that validation.
  projectDocument?: (document: LoroDoc) => unknown
}) {
  const currentDoc = snapshotToLoroDoc(snapshot)

  const { loroDoc: fullUpdatedDoc } = yield* parseCrdtUpdate<S>({
    crdtUpdate: crdtUpdate,
    sourceDocument: currentDoc,
    targetSchema,
    ...(projectDocument ? { projectDocument } : {}),
  })

  // We could export the `update` snapshot from `editedDoc`, but then every intermediary update would be captured.
  // This mean bloat and potentially leaking private data (say a user accidentally pasted sensitive data in the form).
  // Instead, we generate a diff, which captures only the final updates, and then a apply it to a new, 3rd document.
  // Now, this 3rd document can export the CRDT update without any of the intermediary data in it.
  // Private in-betweens (only what the user explicitly chose to publish is included) and lean result.
  const cleanFinalDocument = yield* modifyLoroDocWithCommit({
    initialDoc: currentDoc,
    commit,
    modifyDoc: () => Effect.succeed(fullUpdatedDoc),
  })

  const data = yield* validateCrdtDocument({
    updatedDoc: cleanFinalDocument,
    targetSchema,
    projectDocument: projectDocument ?? ((document) => document.toJSON()),
  })

  return {
    cleanDoc: cleanFinalDocument,
    crdtUpdate: cleanFinalDocument.export({
      from: currentDoc.version(),
      mode: "update",
    }),
    data,
    fromCrdtFrontier: LoroDocFrontier.make(currentDoc.frontiers()),
    nextCrdtFrontier: LoroDocFrontier.make(cleanFinalDocument.frontiers()),
    nextSnapshot: loroDocToSnapshot(cleanFinalDocument),
  } as const
})

export const EMPTY_LORO_DOC_FRONTIER = LoroDocFrontier.make([])

export const createCrdtListItemId = () => LoroListItemId.make(nanoid(12))
