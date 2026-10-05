import { Password, Schema as AuthSchema, Sessions } from "@yielded/auth";
import { Context, Effect, Layer, Option, Redacted, Schema } from "effect";

import {
  claims,
  current,
  customer,
  evidenceDeadline,
  invalidate,
  passwordCredential,
  satisfies,
} from "./accounts";
import { AppAuth } from "./auth";
import { charge, nextId, type State } from "./model";
import { completionCurrent, consumeCompletion } from "./proofs";
import { AccountStore } from "./store";

const moduleId = AppAuth.strategies.password.persistence.moduleId;

const encodeCredential = Schema.encodeSync(
  Schema.fromJsonString(Password.PasswordCredentialSnapshot),
);

const mutationCurrent = Effect.fn("Customers.passwordMutationCurrent")(function* (
  state: Readonly<State>,
  input: Password.PasswordMutationInput,
) {
  const { authorization: auth } = input;
  const account = customer(state, input.expectedRevision.subjectId);
  const password = account === undefined ? undefined : passwordCredential(state, account);

  return (
    input.moduleId === moduleId &&
    account !== undefined &&
    password !== undefined &&
    input.credential !== undefined &&
    password.credentialId === input.credential.credentialId &&
    password.credentialRevision === input.credential.credentialRevision &&
    current(state, input.expectedRevision) &&
    current(state, auth.challenge.revision) &&
    auth.challenge.moduleId === moduleId &&
    auth.challenge.commandId === input.commandId &&
    auth.challenge.revision.subjectId === account.id &&
    auth.challenge.targetCredentialId === password.credentialId &&
    String(auth.evidence.flowId) === String(input.commandId) &&
    auth.evidence.bindingDigest === auth.challenge.bindingDigest &&
    auth.evidence.revision.subjectId === account.id &&
    input.invalidation.existingSessions === "immediate" &&
    (yield* satisfies(state, auth.evidence, auth.requirement))
  );
});

const replace = (state: State, input: Password.PasswordMutationInput) => {
  state.passwords = state.passwords.map((item) =>
    item.credentialId === input.credential?.credentialId
      ? {
          ...item,
          replacement: input.replacement,
          revision: Sessions.SecurityRevision.make(nextId(state, "password-revision")),
          verifierVersion: Sessions.SecurityRevision.make(nextId(state, "verifier")),
        }
      : item,
  );
  invalidate(state, input.expectedRevision.subjectId);
};

export const PasswordsLive = Layer.effectContext(
  Effect.gen(function* () {
    const store = yield* AccountStore;

    const passwords = Password.PasswordPersistence.of({
      admitAttempt: (input, prepare) =>
        store
          .transaction((state, journal, now) =>
            Effect.sync(() => {
              if (input.moduleId !== moduleId) return prepare({ _tag: "Denied" }, journal);

              const account = state.customers.find(
                (item) =>
                  item.active &&
                  (input.identifier.namespace === "email"
                    ? item.email === input.identifier.value
                    : input.identifier.namespace === "username" &&
                      item.username === input.identifier.value) &&
                  (input.subjectId === undefined || item.id === input.subjectId),
              );

              const captured =
                account === undefined ? undefined : passwordCredential(state, account);

              const scopes = [
                { bucket: `password/${input.action}/global`, ...input.policy.action },
                {
                  bucket: `password/${input.action}/${input.identifier.namespace}/${input.identifier.value}`,
                  ...input.policy.identifier,
                },
                ...(account === undefined
                  ? []
                  : [
                      {
                        bucket: `password/${input.action}/subject/${account.id}`,
                        ...input.policy.subject,
                      },
                    ]),
              ];

              const admitted = charge(state, scopes, now);

              if (
                !admitted ||
                state.attempts.filter((item) => item.pending && item.deadline > now).length >=
                  input.policy.maximumPending
              )
                return prepare({ _tag: "Denied" }, journal);
              const attemptId = Password.PasswordAttemptId.make(nextId(state, "attempt"));

              const receipt = prepare(
                {
                  _tag: "Admitted",
                  attemptId,
                  ...(captured === undefined ? {} : { credential: captured }),
                },
                journal,
              );

              state.attempts = [
                ...state.attempts,
                {
                  id: attemptId,
                  moduleId,
                  action: input.action,
                  ...(captured === undefined ? {} : { captured }),
                  pending: true,
                  deadline: now + input.policy.attemptLifetimeMillis,
                  retentionUntil:
                    now +
                    Math.max(
                      input.policy.attemptLifetimeMillis,
                      ...scopes.map((item) => item.windowMillis),
                    ),
                },
              ];

              return receipt;
            }),
          )
          .pipe(Effect.catchTag("StoreUnavailable", () => Password.PasswordUnavailable.make({}))),
      settleAttempt: (input, prepare) =>
        store
          .transaction((state, journal, now) =>
            Effect.sync(() => {
              const attempt = state.attempts.find(
                (item) => item.id === input.attemptId && item.moduleId === input.moduleId,
              );

              const captured = input.captured;

              const account =
                captured === undefined ? undefined : customer(state, captured.revision.subjectId);

              const actual = account === undefined ? undefined : passwordCredential(state, account);

              const verified =
                input.moduleId === moduleId &&
                input.outcome === "verified" &&
                attempt?.pending === true &&
                attempt.deadline > now &&
                captured !== undefined &&
                attempt.captured !== undefined &&
                actual !== undefined &&
                encodeCredential(captured) === encodeCredential(attempt.captured) &&
                current(state, captured.revision) &&
                captured.credentialId === actual.credentialId &&
                captured.credentialRevision === actual.credentialRevision &&
                captured.identifierBindingRevision === actual.identifierBindingRevision &&
                captured.identifier.value === actual.identifier.value;

              const receipt = prepare(verified ? "verified" : "rejected", journal);

              if (verified && attempt !== undefined)
                journal.beforeCommit((time) => time >= now && time < attempt.deadline);
              state.attempts = state.attempts.map((item) =>
                item === attempt ? { ...item, pending: false } : item,
              );
              const rehash = input.rehash;

              if (verified && rehash !== undefined)
                state.passwords = state.passwords.map((item) =>
                  item.credentialId === captured?.credentialId &&
                  item.verifierVersion === rehash.expectedVersion &&
                  Redacted.value(item.replacement.verifier) ===
                    Redacted.value(rehash.expectedVerifier)
                    ? {
                        ...item,
                        replacement: { ...item.replacement, verifier: rehash.nextVerifier },
                        verifierVersion: Sessions.SecurityRevision.make(nextId(state, "verifier")),
                      }
                    : item,
                );

              return receipt;
            }),
          )
          .pipe(Effect.catchTag("StoreUnavailable", () => Password.PasswordUnavailable.make({}))),
      readForSubject: (input) =>
        store
          .read((state) =>
            Effect.sync(() => {
              const account =
                input.moduleId === moduleId ? customer(state, input.subjectId) : undefined;

              return Option.fromNullishOr(
                account === undefined ? undefined : passwordCredential(state, account),
              );
            }),
          )
          .pipe(Effect.catchTag("StoreUnavailable", () => Password.PasswordUnavailable.make({}))),
      recoveryTarget: (input) =>
        store
          .read((state) =>
            Effect.sync(() => {
              const account =
                input.moduleId === moduleId && input.identifier.namespace === "email"
                  ? state.customers.find(
                      (item) =>
                        item.active &&
                        item.email === input.identifier.value &&
                        item.verifiedAtMillis !== undefined,
                    )
                  : undefined;

              return Option.fromNullishOr(
                account === undefined ? undefined : passwordCredential(state, account),
              );
            }),
          )
          .pipe(Effect.catchTag("StoreUnavailable", () => Password.PasswordUnavailable.make({}))),
      // Every customer in this application registers a password; adding another is unsupported.
      addIfAbsent: () => Effect.fail(Password.PasswordUnavailable.make({})),
      replaceIfCurrent: (input, prepare) =>
        store
          .transaction((state, journal, now) =>
            Effect.gen(function* () {
              if (
                input.authorization.challenge.action !== "change-password" ||
                !(yield* mutationCurrent(state, input)) ||
                state.mutations.some(
                  (item) => item.moduleId === moduleId && item.commandId === input.commandId,
                )
              )
                return prepare("rejected", journal);
              const receipt = prepare("changed", journal);

              journal.beforeCommit(
                (time) =>
                  time >= now &&
                  time <
                    evidenceDeadline(input.authorization.evidence, input.authorization.requirement),
              );
              replace(state, input);
              state.mutations = [
                ...state.mutations,
                {
                  moduleId,
                  commandId: input.commandId,
                  subjectId: input.expectedRevision.subjectId,
                  kind: "password",
                  retentionUntil: now + 3_600_000,
                },
              ];

              return receipt;
            }),
          )
          .pipe(Effect.mapError(() => Password.PasswordUnavailable.make({}))),
      checkReset: (input) =>
        store
          .read((state, now) => Effect.succeed(completionCurrent(state, input, now)))
          .pipe(Effect.catchTag("StoreUnavailable", () => Password.PasswordUnavailable.make({}))),
      resetWithProof: (input, prepare) =>
        store
          .transaction((state, journal, now) =>
            Effect.gen(function* () {
              if (
                input.authorization.challenge.action !== "reset-password" ||
                input.completion.input.binding._tag !== "Subject" ||
                input.completion.input.binding.revision.subjectId !==
                  input.expectedRevision.subjectId ||
                !completionCurrent(state, input.completion.input, now) ||
                !(yield* mutationCurrent(state, input)) ||
                state.mutations.some(
                  (item) => item.moduleId === moduleId && item.commandId === input.commandId,
                )
              )
                return prepare("rejected", journal);
              const receipt = prepare("changed", journal);

              const expiresAt =
                state.continuations.find(
                  (row) =>
                    row.id === input.completion.input.continuationId &&
                    row.moduleId === input.completion.input.moduleId,
                )?.expiresAt ?? 0;

              journal.beforeCommit(
                (time) =>
                  time >= now &&
                  time <
                    Math.min(
                      expiresAt,
                      evidenceDeadline(
                        input.authorization.evidence,
                        input.authorization.requirement,
                      ),
                    ),
              );
              input.completion.prepare("completed", journal, () => undefined);
              consumeCompletion(state, input.completion.input);
              replace(state, input);
              state.mutations = [
                ...state.mutations,
                {
                  moduleId,
                  commandId: input.commandId,
                  subjectId: input.expectedRevision.subjectId,
                  kind: "password",
                  retentionUntil: now + 3_600_000,
                },
              ];

              return receipt;
            }),
          )
          .pipe(Effect.mapError(() => Password.PasswordUnavailable.make({}))),
      cleanupAttempts: (input, prepare) =>
        store
          .transaction((state, journal, now) =>
            Effect.sync(() => {
              const expired = state.attempts.filter(
                (row) => row.moduleId === input.moduleId && row.retentionUntil <= now,
              );

              const removed = expired.slice(0, input.limit);

              const receipt = prepare(
                { removed: removed.length, hasMore: expired.length > removed.length },
                journal,
              );

              state.attempts = state.attempts.filter((row) => !removed.includes(row));

              return receipt;
            }),
          )
          .pipe(Effect.catchTag("StoreUnavailable", () => Password.PasswordUnavailable.make({}))),
    });

    return Context.make(Password.PasswordPersistence, passwords).pipe(
      Context.add(AppAuth.strategies.password.RegistrationAuthority, {
        register: (input, prepare) =>
          store
            .transaction((state, journal) =>
              Effect.gen(function* () {
                if (input.moduleId !== moduleId || input.identifier.namespace !== "email")
                  return yield* Password.PasswordUnavailable.make({});
                // A public request ID never adopts an old subject or replaces its password.
                if (
                  state.registrations.some((item) => item.requestId === input.requestId) ||
                  state.customers.some(
                    (item) =>
                      item.email === input.identifier.value ||
                      item.username === input.registration.username,
                  )
                )
                  return prepare({ _tag: "Suppressed" }, journal);
                const subjectId = AuthSchema.SubjectId.make(nextId(state, "customer"));

                const email = yield* Schema.decodeEffect(AuthSchema.Email)(
                  input.identifier.value,
                ).pipe(Effect.mapError(() => Password.PasswordUnavailable.make({})));

                const receipt = prepare({ _tag: "Created", subjectId }, journal);

                state.customers = [
                  ...state.customers,
                  {
                    id: subjectId,
                    email,
                    active: true,
                    displayName: input.registration.displayName,
                    username: input.registration.username,
                    securityRevision: Sessions.SecurityRevision.make(nextId(state, "security")),
                    identifierRevision: Sessions.SecurityRevision.make(nextId(state, "identifier")),
                  },
                ];
                state.passwords = [
                  ...state.passwords,
                  {
                    subjectId,
                    credentialId: nextId(state, "password"),
                    replacement: input.replacement,
                    revision: Sessions.SecurityRevision.make(nextId(state, "password-revision")),
                    verifierVersion: Sessions.SecurityRevision.make(nextId(state, "verifier")),
                  },
                ];
                state.registrations = [
                  ...state.registrations,
                  {
                    requestId: input.requestId,
                    identifier: input.identifier,
                    registration: input.registration,
                    replacement: input.replacement,
                  },
                ];

                return receipt;
              }),
            )
            .pipe(Effect.catchTag("StoreUnavailable", () => Password.PasswordUnavailable.make({}))),
      }),
      Context.add(AppAuth.strategies.password.SessionClaims, {
        resolve: ({ subjectId, credential }) =>
          store
            .read((state) =>
              Effect.gen(function* () {
                const account = customer(state, subjectId);

                if (account === undefined || !current(state, credential.revision))
                  return yield* Password.PasswordUnavailable.make({});

                return claims(account);
              }),
            )
            .pipe(Effect.catchTag("StoreUnavailable", () => Password.PasswordUnavailable.make({}))),
      }),
    );
  }),
);
