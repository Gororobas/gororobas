import { Proofs } from "@yielded/auth";
import { Effect, Schema } from "effect";

/** Disposable example storage. The caller owns copy-on-write publication and
 * includes protected mutations in that same owner; this is not a SQL adapter. */
export interface ProofRow {
  readonly record: Proofs.ProofRecord;
  failedAttempts: number;
}

export type ProofRows = Map<string, ProofRow>;

const bindingCodec = Schema.fromJsonString(Schema.toCodecJson(Schema.toType(Proofs.ProofBinding)));
const binding = Schema.encodeSync(bindingCodec);

const series = (moduleId: string, purpose: string, value: Proofs.ProofBinding) =>
  JSON.stringify([
    moduleId,
    purpose,
    value.identifier.namespace,
    value.identifier.value,
    value._tag === "Identifier" ? "" : value.revision.subjectId,
  ]);

export const restoreProofRows = Effect.fnUntraced(function* (records: ReadonlyArray<ProofRow>) {
  const rows: ProofRows = new Map();

  for (const row of records) {
    const key = series(row.record.moduleId, row.record.purpose, row.record.binding);

    if (rows.has(key)) return yield* Proofs.ProofUnavailable.make({});
    rows.set(key, { ...row });
  }

  return rows;
});

export const copyProofRows = (rows: ProofRows): ProofRows =>
  new Map([...rows].map(([key, row]) => [key, { ...row }]));

export const issueProof = (
  rows: ProofRows,
  input: Parameters<Proofs.ProofPersistence["Service"]["issue"]>[0],
  now: number,
): Proofs.ProofIssueDecision => {
  const key = series(input.record.moduleId, input.record.purpose, input.record.binding);
  const prior = rows.get(key);

  if (
    !input.eligible ||
    (prior !== undefined &&
      (now < prior.record.issuedAtMillis + input.resendCooldownMillis ||
        (prior.record.expiresAtMillis > now &&
          binding(prior.record.binding) !== binding(input.record.binding))))
  )
    return { _tag: "Suppressed" };

  const record = {
    ...input.record,
    issuedAtMillis: now,
    expiresAtMillis: now + input.lifetimeMillis,
  };

  rows.set(key, { record, failedAttempts: 0 });

  return { _tag: "Issued", record };
};

export const redeemProof = (
  rows: ProofRows,
  input: Proofs.ProofRedemptionInput,
  now: number,
): Proofs.ProofRedemptionDecision => {
  const key = series(input.moduleId, input.purpose, input.binding);
  const row = rows.get(key);

  if (
    row === undefined ||
    row.record.proofId !== input.proofId ||
    binding(row.record.binding) !== binding(input.binding)
  )
    return "rejected";
  if (
    row.record.issuedAtMillis <= now &&
    row.record.expiresAtMillis > now &&
    row.failedAttempts < input.maximumFailedAttempts &&
    input.candidate?.keyId === row.record.verifier.keyId &&
    input.candidate.digest === row.record.verifier.digest
  ) {
    rows.delete(key);

    return "redeemed";
  }
  row.failedAttempts = Math.min(input.maximumFailedAttempts, row.failedAttempts + 1);

  return "rejected";
};

export const cancelProof = (
  rows: ProofRows,
  input: Parameters<Proofs.ProofPersistence["Service"]["cancel"]>[0],
) => {
  const key = series(input.moduleId, input.purpose, input.binding);
  const row = rows.get(key);

  if (row !== undefined && binding(row.record.binding) === binding(input.binding)) rows.delete(key);
};

export const cleanupProofs = (
  rows: ProofRows,
  input: Parameters<Proofs.ProofPersistence["Service"]["cleanup"]>[0],
  now: number,
) => {
  const expired = [...rows.entries()]
    .filter(
      ([, row]) => row.record.moduleId === input.moduleId && row.record.expiresAtMillis <= now,
    )
    .sort(
      ([a, left], [b, right]) =>
        left.record.expiresAtMillis - right.record.expiresAtMillis || (a < b ? -1 : a > b ? 1 : 0),
    )
    .slice(0, input.limit);

  for (const [key] of expired) rows.delete(key);

  return { removed: expired.length, hasMore: expired.length === input.limit };
};
