import { Sessions } from "@yielded/auth";
import { Context, DateTime, Effect, Layer } from "effect";

import { requirement } from "../../shared/account/auth";
import {
  claims,
  credentials,
  current,
  customer,
  evidenceDeadline,
  invalidate,
  revision,
  satisfies,
} from "./accounts";
import { AppAuth } from "./auth";
import { nextId, type Session, type State } from "./model";
import { AccountStore } from "./store";

const validSession = (state: Readonly<State>, row: Session, now: number) =>
  customer(state, row.subjectId)?.securityRevision === row.securityRevision &&
  current(state, row.provenance.evidence.revision) &&
  now <
    Math.min(DateTime.toEpochMillis(row.expiresAt), DateTime.toEpochMillis(row.absoluteExpiresAt));

export const SessionsLive = Layer.effectContext(
  Effect.gen(function* () {
    const store = yield* AccountStore;

    const authority = Sessions.AuthenticationAuthority.of({
      capture: (id, ids) =>
        store
          .read((state) =>
            Effect.gen(function* () {
              const account = customer(state, id);

              if (
                account === undefined ||
                !ids.every((id) =>
                  credentials(state, account.id).some((item) => item.credentialId === id),
                )
              )
                return yield* Sessions.StaleAuthentication.make({});

              return revision(state, account, ids);
            }),
          )
          .pipe(Effect.catchTag("StoreUnavailable", () => Sessions.SessionUnavailable.make({}))),
      requirements: (evidence) =>
        store
          .read((state) =>
            Effect.gen(function* () {
              if (!(yield* satisfies(state, evidence, requirement)))
                return yield* Sessions.StaleAuthentication.make({});

              return requirement;
            }),
          )
          .pipe(
            Effect.catchTag(["StoreUnavailable", "SessionConfigurationError"], () =>
              Sessions.SessionUnavailable.make({}),
            ),
          ),
      approve: (input, prepare) =>
        store
          .transaction((state, journal, now) =>
            Effect.gen(function* () {
              if (
                input.pending !== undefined ||
                !(yield* satisfies(state, input.evidence, requirement)) ||
                now >=
                  Math.min(
                    DateTime.toEpochMillis(input.expiresAt),
                    DateTime.toEpochMillis(input.absoluteExpiresAt),
                  )
              )
                return yield* Sessions.StaleAuthentication.make({});
              journal.beforeCommit(
                (fresh) =>
                  fresh >= now &&
                  fresh <
                    Math.min(
                      evidenceDeadline(input.evidence, requirement),
                      DateTime.toEpochMillis(input.expiresAt),
                      DateTime.toEpochMillis(input.absoluteExpiresAt),
                    ),
              );

              return prepare(undefined, journal);
            }),
          )
          .pipe(
            Effect.catchTag(["StoreUnavailable", "SessionConfigurationError"], () =>
              Sessions.SessionUnavailable.make({}),
            ),
          ),
    });

    const sessions = AppAuth.sessions.StatefulSessionPersistence.of({
      establish: (input, prepare) =>
        store
          .transaction((state, journal, now) =>
            Effect.gen(function* () {
              if (
                input.pending !== undefined ||
                !(yield* satisfies(state, input.evidence, requirement)) ||
                input.session.subjectId !== input.evidence.revision.subjectId ||
                input.session.securityRevision !== input.evidence.revision.securityRevision ||
                now >=
                  Math.min(
                    DateTime.toEpochMillis(input.session.expiresAt),
                    DateTime.toEpochMillis(input.session.absoluteExpiresAt),
                  )
              )
                return yield* Sessions.StaleAuthentication.make({});
              if (
                state.flows.some(
                  (row) => row.id === input.evidence.flowId && row.expiresAt > now,
                ) ||
                state.sessions.some((row) => row.digest === input.session.digest)
              )
                return yield* Sessions.SessionConflict.make({});

              const row: Session = {
                ...input.session,
                sessionId: Sessions.SessionId.make(nextId(state, "session")),
                version: Sessions.SecurityRevision.make(nextId(state, "session-version")),
              };

              if (row.sessionId === input.handoffSourceSessionId)
                return yield* Sessions.SessionConflict.make({});

              const receipt = prepare(row, journal);

              journal.beforeCommit(
                (fresh) =>
                  fresh >= now &&
                  fresh <
                    Math.min(
                      evidenceDeadline(input.evidence, requirement),
                      DateTime.toEpochMillis(row.expiresAt),
                      DateTime.toEpochMillis(row.absoluteExpiresAt),
                    ),
              );
              state.sessions = [...state.sessions, row];
              state.flows = [
                ...state.flows.filter((flow) => flow.expiresAt > now),
                {
                  id: input.evidence.flowId,
                  expiresAt: DateTime.toEpochMillis(row.absoluteExpiresAt),
                },
              ];

              return receipt;
            }),
          )
          .pipe(
            Effect.catchTag(["StoreUnavailable", "SessionConfigurationError"], () =>
              Sessions.SessionUnavailable.make({}),
            ),
          ),
      verify: (input) =>
        store
          .read((state, now) =>
            Effect.gen(function* () {
              const row = state.sessions.find((row) => row.digest === input.digest);
              const account = row === undefined ? undefined : customer(state, row.subjectId);

              if (row === undefined || account === undefined || !validSession(state, row, now))
                return yield* Sessions.SessionInvalid.make({});

              return { ...row, claims: claims(account) };
            }),
          )
          .pipe(Effect.catchTag("StoreUnavailable", () => Sessions.SessionUnavailable.make({}))),
      rotate: (input, prepare) =>
        store
          .transaction((state, journal, now) =>
            Effect.gen(function* () {
              const row = state.sessions.find((row) => row.sessionId === input.sessionId);

              if (
                row === undefined ||
                !validSession(state, row, now) ||
                row.digest !== input.expectedDigest ||
                row.version !== input.expectedVersion ||
                row.securityRevision !== input.expectedSecurityRevision ||
                DateTime.toEpochMillis(input.nextExpiresAt) <= now ||
                DateTime.toEpochMillis(input.nextExpiresAt) >
                  DateTime.toEpochMillis(row.absoluteExpiresAt) ||
                state.sessions.some((other) => other.digest === input.nextDigest)
              )
                return yield* Sessions.SessionConflict.make({});

              const next: Session = {
                ...row,
                digest: input.nextDigest,
                credentialVersion: input.nextCredentialVersion,
                issuedAt: DateTime.makeUnsafe(now),
                expiresAt: input.nextExpiresAt,
                version: Sessions.SecurityRevision.make(nextId(state, "session-version")),
              };

              const receipt = prepare(next, journal);

              journal.beforeCommit(
                (fresh) =>
                  fresh >= now &&
                  validSession(state, row, fresh) &&
                  fresh < DateTime.toEpochMillis(next.expiresAt),
              );
              state.sessions = state.sessions.map((item) =>
                item.sessionId === row.sessionId ? next : item,
              );

              return receipt;
            }),
          )
          .pipe(Effect.catchTag("StoreUnavailable", () => Sessions.SessionUnavailable.make({}))),
      revokeDigest: (digest, prepare) =>
        store
          .transaction((state, journal) =>
            Effect.sync(() => {
              const found = state.sessions.some((row) => row.digest === digest);
              const receipt = prepare(found, journal);

              state.sessions = state.sessions.filter((row) => row.digest !== digest);

              return receipt;
            }),
          )
          .pipe(Effect.catchTag("StoreUnavailable", () => Sessions.SessionUnavailable.make({}))),
      revoke: (input, prepare) =>
        store
          .transaction((state, journal) =>
            Effect.gen(function* () {
              if (
                customer(state, input.subjectId)?.securityRevision !==
                input.expectedSecurityRevision
              )
                return yield* Sessions.StaleAuthentication.make({});
              const receipt = prepare(undefined, journal);

              state.sessions = state.sessions.filter(
                (row) => row.subjectId !== input.subjectId || row.sessionId !== input.sessionId,
              );

              return receipt;
            }),
          )
          .pipe(Effect.catchTag("StoreUnavailable", () => Sessions.SessionUnavailable.make({}))),
      revokeAll: (input, prepare) =>
        store
          .transaction((state, journal) =>
            Effect.gen(function* () {
              if (
                customer(state, input.subjectId)?.securityRevision !==
                input.expectedSecurityRevision
              )
                return yield* Sessions.StaleAuthentication.make({});
              const receipt = prepare(undefined, journal);

              invalidate(state, input.subjectId);

              return receipt;
            }),
          )
          .pipe(Effect.catchTag("StoreUnavailable", () => Sessions.SessionUnavailable.make({}))),
    });

    return Context.make(Sessions.AuthenticationAuthority, authority).pipe(
      Context.add(AppAuth.sessions.StatefulSessionPersistence, sessions),
      Context.add(AppAuth.sessions.SessionRepository, {
        list: (input) =>
          store
            .read((state, now) =>
              Effect.sync(() => {
                const rows = state.sessions
                  .filter(
                    (row) =>
                      row.subjectId === input.subjectId &&
                      validSession(state, row, now) &&
                      (input.cursor === undefined || row.sessionId > input.cursor),
                  )
                  .sort((a, b) => a.sessionId.localeCompare(b.sessionId));

                const page = rows.slice(0, input.limit);

                return {
                  sessions: page.map(
                    ({
                      sessionId,
                      subjectId,
                      securityRevision,
                      assurance,
                      issuedAt,
                      expiresAt,
                      absoluteExpiresAt,
                    }) => ({
                      sessionId,
                      subjectId,
                      securityRevision,
                      assurance,
                      issuedAt,
                      expiresAt,
                      absoluteExpiresAt,
                    }),
                  ),
                  ...(rows.length > page.length
                    ? { nextCursor: page[page.length - 1]?.sessionId }
                    : {}),
                };
              }),
            )
            .pipe(Effect.catchTag("StoreUnavailable", () => Sessions.SessionUnavailable.make({}))),
      }),
    );
  }),
);
