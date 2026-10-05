import { Password, type Proofs, type Schema as AuthSchema, Sessions } from "@yielded/auth";
import { DateTime, Effect } from "effect";

import { AppAuth } from "./auth";
import type { Claims } from "./contract";
import { nextId, type Customer, type State } from "./model";

export const customer = (state: Readonly<State>, id: AuthSchema.SubjectId) =>
  state.customers.find((item) => item.id === id && item.active);

export const credentials = (state: Readonly<State>, id: AuthSchema.SubjectId) => [
  ...state.passwords
    .filter((item) => item.subjectId === id)
    .map((item) => ({ credentialId: item.credentialId, revision: item.revision })),
  ...state.passkeys
    .filter((item) => item.credential.active && item.credential.revision.subjectId === id)
    .flatMap((item) => item.credential.revision.credentials),
  ...state.customers
    .filter((item) => item.id === id && item.emailCredential !== undefined)
    .flatMap((item) =>
      item.emailCredential === undefined
        ? []
        : [
            {
              credentialId: item.emailCredential.id,
              revision: item.emailCredential.revision,
            },
          ],
    ),
];

export const revision = (
  state: Readonly<State>,
  account: Customer,
  ids?: ReadonlyArray<string>,
): Sessions.AuthenticationRevision => ({
  subjectId: account.id,
  securityRevision: account.securityRevision,
  credentials: credentials(state, account.id).filter(
    (item) => ids === undefined || ids.includes(item.credentialId),
  ),
});

export const current = (state: Readonly<State>, snapshot: Sessions.AuthenticationRevision) => {
  const account = customer(state, snapshot.subjectId);

  if (account === undefined || account.securityRevision !== snapshot.securityRevision) return false;
  const available = credentials(state, account.id);

  return snapshot.credentials.every((item) =>
    available.some(
      (actual) => actual.credentialId === item.credentialId && actual.revision === item.revision,
    ),
  );
};

export const passwordCredential = (state: Readonly<State>, account: Customer) => {
  const password = state.passwords.find((item) => item.subjectId === account.id);

  return password === undefined
    ? undefined
    : Password.PasswordCredentialSnapshot.make({
        moduleId: AppAuth.strategies.password.persistence.moduleId,
        revision: revision(state, account, [password.credentialId]),
        credentialId: password.credentialId,
        credentialRevision: password.revision,
        verifierVersion: password.verifierVersion,
        verifier: password.replacement.verifier,
        normalization: password.replacement.normalization,
        identifier: { namespace: "email", value: account.email },
        identifierBindingRevision: account.identifierRevision,
        ...(account.verifiedAtMillis === undefined
          ? {}
          : { identifierVerifiedAtMillis: account.verifiedAtMillis }),
      });
};

export const claims = (account: Customer): typeof Claims.Type => ({
  displayName: account.displayName,
  username: account.username,
  email: account.email,
  emailVerified: account.verifiedAtMillis !== undefined,
});

export const satisfies = Effect.fn("Customers.satisfies")(function* (
  state: Readonly<State>,
  evidence: Sessions.AuthenticationEvidence,
  requirement: Sessions.AuthenticationRequirement,
) {
  if (!current(state, evidence.revision)) return false;

  return (yield* Sessions.assessAuthentication(evidence, requirement)).satisfied;
});

export const evidenceDeadline = (
  evidence: Sessions.AuthenticationEvidence,
  requirement: Sessions.AuthenticationRequirement,
) =>
  Math.min(
    ...evidence.proofs.map(
      (proof) => DateTime.toEpochMillis(proof.verifiedAt) + requirement.maximumAgeMillis,
    ),
  );

export const bindingCurrent = (
  state: Readonly<State>,
  binding: Proofs.ProofBinding,
  purpose: string,
) => {
  const owner = state.customers.find(
    (item) => item.email === binding.identifier.value && item.active,
  );

  if (binding.identifier.namespace !== "email") return false;
  if (binding._tag === "Identifier") return owner === undefined;
  if (!current(state, binding.revision) || owner?.id !== binding.revision.subjectId) return false;

  return purpose === "password-reset"
    ? owner.verifiedAtMillis !== undefined
    : owner.verifiedAtMillis === undefined;
};

export const invalidate = (state: State, subjectId: AuthSchema.SubjectId) => {
  state.customers = state.customers.map((item) =>
    item.id === subjectId
      ? { ...item, securityRevision: Sessions.SecurityRevision.make(nextId(state, "security")) }
      : item,
  );
  state.sessions = state.sessions.filter((item) => item.subjectId !== subjectId);
};
