import { Array, DateTime, Effect, Schema } from "effect";

import { AuthenticationAssurance } from "../operations/context";
import {
  PendingAuthenticationInvalid,
  SessionConfigurationError,
  StaleAuthentication,
} from "./errors";
import {
  AuthenticationEvidence,
  AuthenticationRequirement,
  SessionAuthenticationProvenance,
} from "./models";

const evidenceCodec = Schema.toCodecIso(AuthenticationEvidence);

export const snapshotAuthenticationEvidence = Effect.fn("snapshotAuthenticationEvidence")(
  function* (evidence: AuthenticationEvidence) {
    // Bound Type input before schema projection allocates a detached proof graph.
    if (evidence.proofs.length > 64 || evidence.revision.credentials.length > 64)
      return yield* StaleAuthentication.make({});

    const projected = yield* Schema.encodeEffect(evidenceCodec)(evidence).pipe(
      Effect.flatMap(Schema.decodeEffect(evidenceCodec)),
      Effect.mapError(() => StaleAuthentication.make({})),
    );

    return Object.freeze({
      ...projected,
      revision: Object.freeze({
        ...projected.revision,
        credentials: Object.freeze(
          projected.revision.credentials.map((item) => Object.freeze({ ...item })),
        ),
      }),
      proofs: Object.freeze(
        Array.map(projected.proofs, (proof) => {
          const verifiedAt = DateTime.makeUnsafe(DateTime.toEpochMillis(proof.verifiedAt));

          // DateTime.Utc caches parts lazily; populate before freezing the detached instant.
          Object.freeze(DateTime.toPartsUtc(verifiedAt));
          Object.freeze(verifiedAt);

          return Object.freeze({
            ...proof,
            factors: Object.freeze([...proof.factors]),
            verifiedAt,
          });
        }),
      ),
    });
  },
);

export const snapshotSessionAuthenticationProvenance = Effect.fn(
  "snapshotSessionAuthenticationProvenance",
)(function* (input: SessionAuthenticationProvenance) {
  if (input?.evidence?.proofs?.length > 64 || input?.evidence?.revision?.credentials?.length > 64)
    return yield* StaleAuthentication.make({});
  yield* Schema.decodeEffect(Schema.toType(SessionAuthenticationProvenance))(input).pipe(
    Effect.mapError(() => StaleAuthentication.make({})),
  );
  const ids = new Set(input.evidence.revision.credentials.map((item) => item.credentialId));

  if (
    ids.size !== input.evidence.revision.credentials.length ||
    input.evidence.proofs.some((proof) => !ids.has(proof.credentialId))
  )
    return yield* StaleAuthentication.make({});

  return Object.freeze({ evidence: yield* snapshotAuthenticationEvidence(input.evidence) });
});

export const assessAuthentication = Effect.fn("assessAuthentication")(function* (
  input: AuthenticationEvidence,
  configured: AuthenticationRequirement,
) {
  if (input.proofs.length > 64 || input.revision.credentials.length > 64)
    return yield* StaleAuthentication.make({});

  const evidence = yield* Schema.decodeEffect(Schema.toType(AuthenticationEvidence))(input).pipe(
    Effect.mapError(() => StaleAuthentication.make({})),
  );

  const requirement = yield* Schema.decodeEffect(AuthenticationRequirement)(configured).pipe(
    Effect.mapError(() => SessionConfigurationError.make({ reason: "pending-authentication" })),
  );

  const revisions = new Map<string, string>();

  for (const revision of evidence.revision.credentials) {
    if (revisions.has(revision.credentialId)) return yield* StaleAuthentication.make({});
    revisions.set(revision.credentialId, revision.revision);
  }
  if (evidence.proofs.some((proof) => !revisions.has(proof.credentialId)))
    return yield* StaleAuthentication.make({});
  const now = DateTime.toEpochMillis(yield* DateTime.now);

  for (const proof of evidence.proofs) {
    const age = now - DateTime.toEpochMillis(proof.verifiedAt);

    if (age < 0) return yield* StaleAuthentication.make({});
  }

  const fresh = evidence.proofs.filter(
    (proof) => now - DateTime.toEpochMillis(proof.verifiedAt) < requirement.maximumAgeMillis,
  );

  if (fresh.length === 0) return yield* StaleAuthentication.make({});
  const factors = [...new Set(fresh.flatMap((proof) => proof.factors))];
  const credentials = new Set(fresh.map((proof) => proof.credentialId));

  const satisfied = requirement.alternatives.some(
    (alternative) =>
      alternative.factors.every((factor) => factors.includes(factor)) &&
      credentials.size >= alternative.minimumCredentials &&
      fresh.some(
        (proof) =>
          (!alternative.userVerified || proof.userVerified) &&
          (!alternative.phishingResistant || proof.phishingResistant),
      ),
  );

  const first = fresh[0];

  const authenticatedAt = fresh.reduce(
    (oldest, proof) =>
      DateTime.toEpochMillis(proof.verifiedAt) < DateTime.toEpochMillis(oldest)
        ? proof.verifiedAt
        : oldest,
    first.verifiedAt,
  );

  const ordinals = new Map<string, number>();

  for (const proof of evidence.proofs) {
    if (!ordinals.has(proof.credentialId)) ordinals.set(proof.credentialId, ordinals.size);
  }
  if (ordinals.size > 64) return yield* StaleAuthentication.make({});

  return {
    satisfied,
    assurance: AuthenticationAssurance.make({
      method: first.method,
      factors,
      authenticatedAt,
      evidence: Array.map(
        evidence.proofs,
        ({ method, credentialId, factors, userVerified, phishingResistant, verifiedAt }) => ({
          method,
          credentialOrdinal: ordinals.get(credentialId)!,
          factors,
          userVerified,
          phishingResistant,
          verifiedAt,
        }),
      ),
    }),
  };
});

/** Never refresh original proof timestamps or the revision captured before primary verification. */
export const combineAuthenticationEvidence = (
  original: AuthenticationEvidence,
  additional: AuthenticationEvidence,
): Effect.Effect<AuthenticationEvidence, PendingAuthenticationInvalid> => {
  if (
    original.flowId !== additional.flowId ||
    original.bindingDigest !== additional.bindingDigest ||
    original.revision.subjectId !== additional.revision.subjectId ||
    original.revision.securityRevision !== additional.revision.securityRevision
  )
    return Effect.fail(PendingAuthenticationInvalid.make({}));

  const revisions = new Map(
    original.revision.credentials.map((credential) => [credential.credentialId, credential]),
  );

  for (const credential of additional.revision.credentials) {
    const previous = revisions.get(credential.credentialId);

    if (previous !== undefined && previous.revision !== credential.revision)
      return Effect.fail(PendingAuthenticationInvalid.make({}));
    revisions.set(credential.credentialId, credential);
  }

  return Effect.succeed({
    ...original,
    revision: { ...original.revision, credentials: [...revisions.values()] },
    proofs: [...original.proofs, ...additional.proofs],
  });
};
