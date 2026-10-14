import type { Redacted } from "effect";
import { Crypto, DateTime, Effect } from "effect";
import { Base64Url } from "effect/encoding";

import { LifecycleHooks } from "../../hooks/LifecycleHooks";
import {
  LifecycleEventId,
  lifecycleEventEffect,
  lifecycleSnapshotEffect,
} from "../../hooks/models";
import type { LoginIdentifier } from "../../identity/models";
import type { Email, SubjectId } from "../../Schema";
import { NewPasswordCheck } from "../NewPasswordCheck";
import { PasswordHashing } from "../PasswordHashing";
import type { PasswordMethodPolicy } from "./policy";
import {
  makePasswordVerification,
  passwordHashingDiagnostics,
  passwordUnexpected as unexpected,
} from "./verification";

/** Preserve the current-password proof instant before new-password hashing. */
export const makePasswordPreparation = ({
  moduleId,
  policy,
}: {
  readonly moduleId: string;
  readonly policy: PasswordMethodPolicy;
}) => {
  const { digest, identifier, verifyPassword } = makePasswordVerification({ moduleId, policy });

  const newReplacement = Effect.fn("Passwords.newReplacement")(function* (
    password: Redacted.Redacted<string>,
    email?: Email,
  ) {
    const checker = yield* NewPasswordCheck;
    const hasher = yield* PasswordHashing;

    const checked = yield* checker.check(password, {
      serviceName: moduleId,
      ...(email === undefined ? {} : { accountName: email }),
    });

    return {
      normalization: checked.normalization,
      verifier: yield* unexpected(hasher.hash(checked.password).pipe(passwordHashingDiagnostics)),
    };
  });

  const event = Effect.fn("Passwords.event")(function* (
    action: "registration" | "credential-change",
    id: LoginIdentifier,
    subjectId?: SubjectId,
  ) {
    const hooks = yield* LifecycleHooks;
    const crypto = yield* Crypto.Crypto;

    const snapshot = yield* lifecycleSnapshotEffect({
      action,
      operation: `${moduleId}/${action}`,
      method: "password",
      identifiers: [id],
      ...(subjectId === undefined ? {} : { subjectId }),
    }).pipe(Effect.orDie);

    yield* hooks.before(snapshot);
    const idBytes = yield* unexpected(crypto.randomBytes(32));

    return yield* lifecycleEventEffect({
      id: LifecycleEventId.make(Base64Url.encode(idBytes)),
      occurredAtMillis: DateTime.toEpochMillis(yield* DateTime.now),
      snapshot,
    }).pipe(Effect.orDie);
  });

  return { digest, identifier, newReplacement, event, verifyPassword };
};
