import { Email, Sessions } from "@yielded/auth";
import { Effect, Layer } from "effect";

import { current, customer, evidenceDeadline, revision, satisfies } from "./accounts";
import { AppAuth } from "./auth";
import { nextId } from "./model";
import { redeemInOwner } from "./proofs";
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
      verifyWithProof: (input, prepare) =>
        store
          .transaction((state, journal, now) =>
            Effect.gen(function* () {
              const { authorization: auth, redemption } = input;
              const account = customer(state, input.captured.revision.subjectId);
              const bound = redemption.input.binding;

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
                !current(state, bound.revision) ||
                bound.identifier.value !== account.email ||
                redemption.input.moduleId !== `${moduleId}/verify-address` ||
                redemption.input.purpose !== "email-address-verification"
              )
                return prepare("rejected", journal);
              if ((yield* redeemInOwner(state, redemption.input, now, journal)) !== "redeemed")
                return prepare("rejected", journal);
              const receipt = prepare("changed", journal);

              journal.beforeCommit(
                (time) => time >= now && time < evidenceDeadline(auth.evidence, auth.requirement),
              );
              redemption.prepare("redeemed", journal, () => undefined);
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

              return receipt;
            }),
          )
          .pipe(Effect.mapError(() => Email.EmailUnavailable.make({}))),
      // This application exposes confirmation of its registered address, not address replacement.
      changeWithProof: () => Effect.fail(Email.EmailUnavailable.make({})),
    });
  }),
);
