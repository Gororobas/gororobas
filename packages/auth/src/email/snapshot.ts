import { Array, Effect, Schema } from "effect";

import { LoginIdentifier } from "../identity/models";
import { AuthenticationRequirement, type AuthenticationRevision } from "../sessions/models";
import { EmailUnavailable } from "./errors";
import { EmailCredentialSnapshot } from "./models";

export const snapshotEmailRevision = (value: AuthenticationRevision): AuthenticationRevision =>
  Object.freeze({
    subjectId: value.subjectId,
    securityRevision: value.securityRevision,
    credentials: Object.freeze(
      value.credentials.map((item) =>
        Object.freeze({ credentialId: item.credentialId, revision: item.revision }),
      ),
    ),
  });

const codec = Schema.toCodecIso(EmailCredentialSnapshot);

export const snapshotEmailCredential = Effect.fn("Email.snapshotCredential")(function* (
  input: EmailCredentialSnapshot,
) {
  const value = yield* Schema.encodeEffect(codec)(input).pipe(
    Effect.flatMap(Schema.decodeEffect(codec)),
    Effect.mapError(() => EmailUnavailable.make({})),
  );

  return Object.freeze({
    ...value,
    identifier: Object.freeze(LoginIdentifier.make(value.identifier)),
    revision: snapshotEmailRevision(value.revision),
  });
});

export const snapshotEmailRequirement = Effect.fn("Email.snapshotRequirement")(function* (
  input: AuthenticationRequirement,
) {
  const value = yield* Schema.decodeEffect(AuthenticationRequirement)(input).pipe(
    Effect.mapError(() => EmailUnavailable.make({})),
  );

  return Object.freeze({
    ...value,
    alternatives: Object.freeze(
      Array.map(value.alternatives, (item) =>
        Object.freeze({ ...item, factors: Object.freeze([...item.factors]) }),
      ),
    ),
  });
});
