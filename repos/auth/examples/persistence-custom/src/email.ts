import { Email, Sessions } from "@yielded/auth";
import { Effect, Layer } from "effect";

import { current, customer, evidenceDeadline, revision, satisfies } from "./accounts";
import { AppAuth } from "./auth";
import { nextId } from "./model";
import { completionCurrent, consumeCompletion } from "./proofs";
import { AccountStore } from "./store";

const moduleId = AppAuth.strategies.email.persistence.moduleId;

export const EmailLive = Layer.effect(
  Email.EmailAddressPersistence,
  Effect.gen(function* () {
    const store = yield* AccountStore;

    return Email.EmailAddressPersistence.of({
      target: (input) =>
        store
          .read((state) =>
            Effect.gen(function* () {
              const account = customer(state, input.subjectId);

              if (input.moduleId !== moduleId || account === undefined)
                return yield* Email.EmailUnavailable.make({});

              const eligible =
                input.target.namespace === "email" &&
                input.target.value === account.email &&
                account.verifiedAtMillis === undefined;

              return {
                revision: revision(state, account),
                eligible,
                ...(eligible ? { targetIdentifierRevision: account.identifierRevision } : {}),
              };
            }),
          )
          .pipe(Effect.catchTag("StoreUnavailable", () => Email.EmailUnavailable.make({}))),
      checkCompletion: (input) =>
        store
          .read((state, now) => Effect.succeed(completionCurrent(state, input, now)))
          .pipe(Effect.catchTag("StoreUnavailable", () => Email.EmailUnavailable.make({}))),
      verifyWithProof: (input, prepare) =>
        store
          .transaction((state, journal, now) =>
            Effect.gen(function* () {
              const { authorization: auth, completion } = input;
              const account = customer(state, input.captured.revision.subjectId);
              const bound = completion.input.binding;

              if (
                input.moduleId !== moduleId ||
                account === undefined ||
                account.verifiedAtMillis !== undefined ||
                input.target.namespace !== "email" ||
                input.target.value !== account.email ||
                !input.captured.eligible ||
                input.captured.targetIdentifierRevision !== account.identifierRevision ||
                input.invalidation !== undefined ||
                !current(state, input.captured.revision) ||
                auth.challenge.moduleId !== moduleId ||
                auth.challenge.action !== "verify-address" ||
                auth.challenge.commandId !== input.commandId ||
                auth.challenge.target.value !== account.email ||
                auth.challenge.targetIdentifierRevision !== account.identifierRevision ||
                auth.challenge.revision.subjectId !== account.id ||
                !current(state, auth.challenge.revision) ||
                auth.evidence.revision.subjectId !== account.id ||
                String(auth.evidence.flowId) !== String(input.commandId) ||
                auth.evidence.bindingDigest !== auth.challenge.bindingDigest ||
                !(yield* satisfies(state, auth.evidence, auth.requirement)) ||
                bound._tag !== "IdentifierChange" ||
                bound.revision.subjectId !== account.id ||
                bound.identifier.value !== account.email ||
                completion.input.moduleId !== `${moduleId}/verify-address` ||
                completion.input.purpose !== "email-address-verification" ||
                !completionCurrent(state, completion.input, now) ||
                state.mutations.some(
                  (item) => item.moduleId === moduleId && item.commandId === input.commandId,
                )
              )
                return prepare("rejected", journal);
              const receipt = prepare("changed", journal);

              const expiresAt =
                state.continuations.find(
                  (row) =>
                    row.id === completion.input.continuationId &&
                    row.moduleId === completion.input.moduleId,
                )?.expiresAt ?? 0;

              journal.beforeCommit(
                (time) =>
                  time >= now &&
                  time < Math.min(expiresAt, evidenceDeadline(auth.evidence, auth.requirement)),
              );
              completion.prepare("completed", journal, () => undefined);
              consumeCompletion(state, completion.input);
              state.customers = state.customers.map((item) =>
                item.id === account.id
                  ? {
                      ...item,
                      verifiedAtMillis: now,
                      identifierRevision: Sessions.SecurityRevision.make(
                        nextId(state, "identifier"),
                      ),
                      emailCredential: {
                        id: nextId(state, "email"),
                        revision: Sessions.SecurityRevision.make(nextId(state, "email-revision")),
                      },
                    }
                  : item,
              );
              state.mutations = [
                ...state.mutations,
                {
                  moduleId,
                  commandId: input.commandId,
                  subjectId: account.id,
                  kind: "email",
                  retentionUntil: now + 3_600_000,
                },
              ];

              return receipt;
            }),
          )
          .pipe(Effect.mapError(() => Email.EmailUnavailable.make({}))),
      // This application exposes confirmation of its registered address, not address replacement.
      changeWithProof: () => Effect.fail(Email.EmailUnavailable.make({})),
      cleanup: (input, prepare) =>
        store
          .transaction((state, journal, now) =>
            Effect.sync(() => {
              const expired = state.mutations.filter(
                (item) => item.moduleId === input.moduleId && item.retentionUntil <= now,
              );

              const removed = expired.slice(0, input.limit);

              state.mutations = state.mutations.filter((item) => !removed.includes(item));

              return prepare(
                { removed: removed.length, hasMore: expired.length > removed.length },
                journal,
              );
            }),
          )
          .pipe(Effect.catchTag("StoreUnavailable", () => Email.EmailUnavailable.make({}))),
    });
  }),
);
