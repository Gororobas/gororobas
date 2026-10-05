import { Array, Effect, Schema } from "effect";

import { LoginIdentifier } from "../../identity/models";
import type { AuthenticationRevision } from "../../sessions/models";
import { AuthenticationRequirement } from "../../sessions/models";
import { PasswordUnavailable } from "./errors";
import { PasswordCredentialSnapshot } from "./models";

/** Detach authority-owned vectors before yielding to KDF/claims/hooks. */
export const snapshotPasswordRevision = (value: AuthenticationRevision): AuthenticationRevision =>
  Object.freeze({
    subjectId: value.subjectId,
    securityRevision: value.securityRevision,
    credentials: Object.freeze(
      value.credentials.map((item) =>
        Object.freeze({ credentialId: item.credentialId, revision: item.revision }),
      ),
    ),
  });

const credentialCodec = Schema.toCodecIso(PasswordCredentialSnapshot);

export const snapshotPasswordCredential = Effect.fn("snapshotPasswordCredential")(function* (
  input: PasswordCredentialSnapshot,
) {
  const value = yield* Schema.encodeEffect(credentialCodec)(input).pipe(
    Effect.flatMap(Schema.decodeEffect(credentialCodec)),
    Effect.mapError(() => PasswordUnavailable.make({})),
  );

  return Object.freeze({
    ...value,
    revision: snapshotPasswordRevision(value.revision),
    identifier: Object.freeze(LoginIdentifier.make(value.identifier)),
  });
});

export const snapshotPasswordRequirement = Effect.fn("snapshotPasswordRequirement")(function* (
  input: AuthenticationRequirement,
) {
  const value = yield* Schema.decodeEffect(AuthenticationRequirement)(input).pipe(
    Effect.mapError(() => PasswordUnavailable.make({})),
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
