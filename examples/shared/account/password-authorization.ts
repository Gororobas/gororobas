import { Operations, Password, Sessions } from "@yielded/auth";
import { Array, DateTime, Effect } from "effect";

import type { AppAuth } from "./auth";
import { requirement } from "./auth";

/** Bind recent passkey assurance to the private provenance of this exact session. */
export const authorizePasswordSession = Effect.fn("Customers.authorizePasswordSession")(function* (
  invocation: Operations.AuthInvocation,
  challenge: Password.PasswordActionChallenge,
  source: Effect.Success<ReturnType<typeof AppAuth.sessions.inspectInvocation>>,
) {
  if (invocation._tag !== "Authenticated") return yield* Password.PasswordActionRequired.make({});

  const now = DateTime.toEpochMillis(yield* DateTime.now);
  const age = now - DateTime.toEpochMillis(invocation.assurance.authenticatedAt);

  if (age < 0 || age >= requirement.maximumAgeMillis)
    return yield* Password.PasswordActionRequired.make({});
  yield* Operations.requireAssurance(invocation, {
    maximumAgeMillis: requirement.maximumAgeMillis,
    factors: ["possession"],
    userVerified: true,
    phishingResistant: true,
  });

  const original = source.inspection.provenance.evidence;

  if (
    source.inspection.session.sessionId !== invocation.sessionId ||
    source.inspection.session.subjectId !== invocation.subjectId ||
    original.revision.subjectId !== challenge.revision.subjectId ||
    original.revision.securityRevision !== challenge.revision.securityRevision
  )
    return yield* Password.PasswordActionRequired.make({});

  const revision = challenge.revision;

  if (
    original.proofs.some((proof) => {
      const captured = original.revision.credentials.find(
        (item) => item.credentialId === proof.credentialId,
      );

      return (
        captured === undefined ||
        !revision.credentials.some(
          (current) =>
            current.credentialId === captured.credentialId &&
            current.revision === captured.revision,
        )
      );
    })
  )
    return yield* Password.PasswordActionRequired.make({});

  if (original.proofs.some((proof) => DateTime.toEpochMillis(proof.verifiedAt) > now))
    return yield* Password.PasswordActionRequired.make({});

  const proofs = original.proofs.filter(
    (proof) =>
      proof.method === "passkey" &&
      proof.factors.includes("possession") &&
      proof.userVerified &&
      proof.phishingResistant &&
      now - DateTime.toEpochMillis(proof.verifiedAt) < requirement.maximumAgeMillis,
  );

  if (!Array.isArrayNonEmpty(proofs)) return yield* Password.PasswordActionRequired.make({});

  return {
    evidence: {
      ...original,
      proofs,
      revision,
      flowId: Sessions.AuthenticationFlowId.make(challenge.commandId),
      bindingDigest: challenge.bindingDigest,
    },
    requirement,
  };
});
