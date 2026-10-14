import { Passkey, Schema as AuthSchema, Sessions } from "@yielded/auth";
import { Context, Crypto, Effect, Layer, Schema } from "effect";
import { Base64Url } from "effect/encoding";

import { requirement } from "../../shared/account/auth";
import { claims, current, customer, evidenceDeadline, revision, satisfies } from "./accounts";
import { AppAuth } from "./auth";
import { nextId, type State } from "./model";
import { AccountStore } from "./store";

const encodeCeremony = Schema.encodeSync(Schema.fromJsonString(Passkey.PasskeyCeremony));
const managementId = AppAuth.strategies.passkeys.persistence.moduleId;
const signInId = AppAuth.strategies.passkey.persistence.moduleId;
const management = AppAuth.strategies.passkeys.persistence.managementPolicy;

const live = (ceremony: Passkey.PasskeyCeremony, now: number) =>
  now >= ceremony.issuedAtMillis &&
  now < ceremony.expiresAtMillis &&
  now < ceremony.requestBindingExpiresAtMillis;

const matches = (ceremony: Passkey.PasskeyCeremony, access: Passkey.PasskeyAccess) =>
  ceremony.moduleId === access.moduleId &&
  ceremony.purpose === access.purpose &&
  ceremony.flowId === access.flowId &&
  ceremony.requestBindingVerifier === access.requestBindingVerifier &&
  ceremony.requestBindingExpiresAtMillis === access.requestBindingExpiresAtMillis;

const credentialFor = (state: Readonly<State>, rpId: string, protocolId: string) => {
  const saved = state.passkeys.find(
    (item) =>
      item.credential.active &&
      item.credential.rpId === rpId &&
      item.credential.protocolCredentialId === protocolId,
  );

  const account =
    saved === undefined ? undefined : customer(state, saved.credential.revision.subjectId);

  return saved === undefined || account === undefined
    ? undefined
    : {
        ...saved.credential,
        requirement,
        revision: revision(state, account),
      };
};

export const PasskeysLive = Layer.effectContext(
  Effect.gen(function* () {
    const store = yield* AccountStore;
    const crypto = yield* Crypto.Crypto;

    const digest = Effect.fn("Customers.passkeyDigest")(function* <
      S extends Schema.Codec<unknown, unknown, never, never>,
    >(schema: S, value: S["Type"]) {
      const encoded = yield* Schema.encodeEffect(
        Schema.fromJsonString(Schema.toCodecJson(Schema.toType(schema))),
      )(value);

      return AuthSchema.TokenDigest.make(
        Base64Url.encode(yield* crypto.digest("SHA-256", new TextEncoder().encode(encoded))),
      );
    });

    const authorize = Effect.fn("Customers.passkeyAuthorization")(function* (
      state: Readonly<State>,
      auth: Passkey.PasskeyActionAuthorization,
      expected: {
        readonly action: Passkey.PasskeyActionAuthorization["challenge"]["action"];
        readonly commandId: string;
        readonly flowId: string;
        readonly digest: string;
        readonly revision: typeof Passkey.PasskeyRevision.Type;
      },
      maximumAge: number,
    ) {
      const { challenge, evidence } = auth;

      return (
        challenge.moduleId === managementId &&
        challenge.action === expected.action &&
        challenge.commandId === expected.commandId &&
        challenge.flowId === expected.flowId &&
        challenge.bindingDigest === expected.digest &&
        evidence.flowId === expected.flowId &&
        evidence.bindingDigest === expected.digest &&
        challenge.revision.subjectId === expected.revision.subjectId &&
        challenge.revision.securityRevision === expected.revision.securityRevision &&
        current(state, challenge.revision) &&
        current(state, expected.revision) &&
        evidence.revision.subjectId === expected.revision.subjectId &&
        (yield* satisfies(state, evidence, {
          ...auth.requirement,
          maximumAgeMillis: Math.min(maximumAge, auth.requirement.maximumAgeMillis),
        })) &&
        (yield* satisfies(state, evidence, requirement))
      );
    });

    const persistence = Passkey.PasskeyPersistence.of({
      issue: ({ ceremony }, prepare) =>
        store
          .transaction((state, journal, now) =>
            Effect.sync(() => {
              const allowed =
                (ceremony.moduleId === signInId &&
                  ceremony.purpose === "sign-in" &&
                  ceremony.context._tag === "SignIn") ||
                (ceremony.moduleId === managementId &&
                  ceremony.purpose === "enrollment" &&
                  ceremony.context._tag === "Enrollment");

              if (
                !allowed ||
                !live(ceremony, now) ||
                state.ceremonies.some(
                  (row) => row.moduleId === ceremony.moduleId && row.flowId === ceremony.flowId,
                )
              )
                return prepare({ _tag: "Rejected" }, journal);
              journal.beforeCommit((time) => live(ceremony, time));
              state.ceremonies = [...state.ceremonies, ceremony];

              return prepare({ _tag: "Issued", ceremony }, journal);
            }),
          )
          .pipe(Effect.mapError(() => Passkey.PasskeyUnavailable.make({}))),
      context: (access) =>
        store
          .read((state, now) =>
            Effect.succeed(state.ceremonies.find((row) => matches(row, access) && live(row, now))),
          )
          .pipe(Effect.mapError(() => Passkey.PasskeyUnavailable.make({}))),
      consume: (input, prepare) =>
        store
          .transaction((state, journal, now) =>
            Effect.sync(() => {
              const ceremony = state.ceremonies.find(
                (row) =>
                  matches(row, input.access) &&
                  encodeCeremony(row) === encodeCeremony(input.ceremony) &&
                  live(row, now),
              );

              if (ceremony === undefined) return prepare("Rejected", journal);
              state.ceremonies = state.ceremonies.filter((row) => row !== ceremony);

              const row = state.passkeys.find(
                (item) =>
                  item.credential.active &&
                  item.credential.credentialId === input.credential.credentialId &&
                  item.credential.rpId === input.credential.rpId &&
                  item.credential.protocolCredentialId === input.assertion.protocolCredentialId,
              );

              if (
                row === undefined ||
                row.credential.backupEligible !== input.credential.backupEligible ||
                !row.credential.revision.credentials.some(
                  (factor) =>
                    factor.credentialId === input.credential.credentialId &&
                    input.credential.revision.credentials.some(
                      (original) =>
                        original.credentialId === factor.credentialId &&
                        original.revision === factor.revision,
                    ),
                ) ||
                (!row.credential.backupEligible &&
                  (row.credential.counter !== 0 || input.assertion.counter !== 0) &&
                  input.assertion.counter <= row.credential.counter)
              )
                return prepare("Rejected", journal);
              journal.beforeCommit((time) => live(ceremony, time));
              state.passkeys = state.passkeys.map((item) =>
                item === row
                  ? {
                      credential: {
                        ...item.credential,
                        counter: Math.max(item.credential.counter, input.assertion.counter),
                        backupState: input.assertion.backupState,
                      },
                      summary: { ...item.summary, lastUsedAtMillis: now },
                    }
                  : item,
              );

              return prepare("Verified", journal);
            }),
          )
          .pipe(Effect.mapError(() => Passkey.PasskeyUnavailable.make({}))),
      cleanup: (input, prepare) =>
        store
          .transaction((state, journal, now) =>
            Effect.sync(() => {
              const expired = state.ceremonies.filter(
                (row) =>
                  row.moduleId === input.moduleId &&
                  Math.min(row.expiresAtMillis, row.requestBindingExpiresAtMillis) <= now,
              );

              const removed = new Set(expired.slice(0, input.limit));

              state.ceremonies = state.ceremonies.filter((row) => !removed.has(row));

              return prepare(
                { removed: removed.size, hasMore: removed.size === input.limit },
                journal,
              );
            }),
          )
          .pipe(Effect.mapError(() => Passkey.PasskeyUnavailable.make({}))),
    });

    const manager = Passkey.PasskeyManagementPersistence.of({
      list: (input) =>
        store
          .read((state) =>
            Effect.gen(function* () {
              if (input.moduleId !== managementId || customer(state, input.subjectId) === undefined)
                return yield* Passkey.PasskeyUnavailable.make({});

              const rows = state.passkeys
                .filter(
                  (row) =>
                    row.credential.active &&
                    row.credential.revision.subjectId === input.subjectId &&
                    (input.cursor === undefined || row.summary.credentialId > input.cursor),
                )
                .sort((a, b) => a.summary.credentialId.localeCompare(b.summary.credentialId));

              const page = rows.slice(0, input.limit);

              return {
                credentials: page.map((row) => row.summary),
                ...(rows.length > page.length
                  ? { cursor: page[page.length - 1]?.summary.credentialId }
                  : {}),
              };
            }),
          )
          .pipe(Effect.mapError(() => Passkey.PasskeyUnavailable.make({}))),
      completeEnrollment: (input, prepare) =>
        store
          .transaction((state, journal, now) =>
            Effect.gen(function* () {
              const ceremony = state.ceremonies.find(
                (row) =>
                  matches(row, input.access) &&
                  encodeCeremony(row) === encodeCeremony(input.ceremony) &&
                  live(row, now),
              );

              if (ceremony === undefined) return prepare({ _tag: "Rejected" }, journal);
              const context = ceremony.context;

              if (context._tag !== "Enrollment" || !current(state, context.revision))
                return prepare({ _tag: "Rejected" }, journal);

              const rows = state.passkeys.filter(
                (row) =>
                  row.credential.active &&
                  row.credential.revision.subjectId === context.revision.subjectId,
              );

              const maximumAge = Math.min(
                management.maximumEvidenceAgeMillis,
                input.management.maximumEvidenceAgeMillis,
              );

              const expectedDigest = yield* digest(
                Schema.Tuple([
                  Passkey.PasskeyModuleId,
                  Schema.Literal("enrollment"),
                  Schema.Struct({ ...Passkey.PasskeyBegin.fields, name: Passkey.PasskeyLabel }),
                  Passkey.PasskeyProfile,
                  Passkey.PasskeyRevision,
                  Passkey.PasskeyUserHandle,
                  Schema.Array(Passkey.PasskeyDescriptor),
                ]),
                [
                  ceremony.moduleId,
                  "enrollment",
                  {
                    flowId: ceremony.flowId,
                    commandId: ceremony.commandId,
                    profileId: ceremony.profile.profileId,
                    name: context.name,
                  },
                  ceremony.profile,
                  context.revision,
                  context.userHandle,
                  ceremony.allowedCredentials,
                ],
              );

              if (
                rows.length >=
                  Math.min(management.maximumCredentials, input.management.maximumCredentials) ||
                state.passkeys.some(
                  (row) =>
                    row.credential.rpId === ceremony.profile.rpId &&
                    row.credential.protocolCredentialId === input.verified.protocolCredentialId,
                ) ||
                !(yield* authorize(
                  state,
                  context.authorization,
                  {
                    action: "enroll-begin",
                    commandId: ceremony.commandId,
                    flowId: ceremony.flowId,
                    digest: expectedDigest,
                    revision: context.revision,
                  },
                  maximumAge,
                ))
              )
                return prepare({ _tag: "Rejected" }, journal);
              const id = nextId(state, "passkey");

              const credential = {
                credentialId: id,
                rpId: ceremony.profile.rpId,
                protocolCredentialId: input.verified.protocolCredentialId,
                userHandle: context.userHandle,
                publicKey: input.verified.publicKey,
                algorithm: input.verified.algorithm,
                profile: ceremony.profile,
                revision: {
                  ...context.revision,
                  credentials: [
                    {
                      credentialId: id,
                      revision: Sessions.SecurityRevision.make(nextId(state, "passkey-revision")),
                    },
                  ],
                },
                active: true,
                primarySignIn: ceremony.profile.primarySignIn && input.verified.userVerified,
                enrollmentUserVerified: input.verified.userVerified,
                backupEligible: input.verified.backupEligible,
                backupState: input.verified.backupState,
                counter: input.verified.counter,
              };

              const summary = {
                credentialId: id,
                name: context.name,
                primarySignIn: credential.primarySignIn,
                createdAtMillis: now,
              };

              journal.beforeCommit(
                (time) =>
                  live(ceremony, time) &&
                  time <
                    evidenceDeadline(context.authorization.evidence, {
                      ...context.authorization.requirement,
                      maximumAgeMillis: Math.min(
                        maximumAge,
                        context.authorization.requirement.maximumAgeMillis,
                        requirement.maximumAgeMillis,
                      ),
                    }),
              );
              state.passkeys = [...state.passkeys, { credential, summary }];
              state.ceremonies = state.ceremonies.filter((row) => row !== ceremony);

              return prepare({ _tag: "Enrolled", credential: summary }, journal);
            }),
          )
          .pipe(Effect.mapError(() => Passkey.PasskeyUnavailable.make({}))),
      rename: (input, prepare) =>
        store
          .transaction((state, journal) =>
            Effect.sync(() => {
              if (input.moduleId !== managementId || customer(state, input.subjectId) === undefined)
                return prepare({ _tag: "Rejected" }, journal);

              const row = state.passkeys.find(
                (item) =>
                  item.credential.active &&
                  item.credential.credentialId === input.credentialId &&
                  item.credential.revision.subjectId === input.subjectId,
              );

              if (row === undefined) return prepare({ _tag: "Rejected" }, journal);
              const summary = { ...row.summary, name: input.name };

              state.passkeys = state.passkeys.map((item) =>
                item === row ? { ...item, summary } : item,
              );

              return prepare({ _tag: "Renamed", credential: summary }, journal);
            }),
          )
          .pipe(Effect.mapError(() => Passkey.PasskeyUnavailable.make({}))),
      // This application's public contract does not expose credential removal.
      inspectRemove: () => Effect.succeed({ _tag: "Rejected" }),
      remove: (_input, prepare) =>
        store
          .transaction((_state, journal) => Effect.succeed(prepare({ _tag: "Rejected" }, journal)))
          .pipe(Effect.mapError(() => Passkey.PasskeyUnavailable.make({}))),
    });

    return Context.make(Passkey.PasskeyPersistence, persistence).pipe(
      Context.add(Passkey.PasskeyManagementPersistence, manager),
      Context.add(Passkey.PasskeyCredentials, {
        lookup: (input) =>
          store
            .read((state) =>
              Effect.succeed(credentialFor(state, input.rpId, input.protocolCredentialId)),
            )
            .pipe(Effect.mapError(() => Passkey.PasskeyUnavailable.make({}))),
        listForSubject: (input) =>
          store
            .read((state) =>
              Effect.sync(() => {
                const account = customer(state, input.subjectId);

                if (
                  account === undefined ||
                  (input.moduleId !== managementId && input.moduleId !== signInId)
                )
                  return undefined;

                const rows = state.passkeys.filter(
                  (item) =>
                    item.credential.active &&
                    item.credential.rpId === input.rpId &&
                    item.credential.revision.subjectId === input.subjectId,
                );

                const userHandle = rows[0]?.credential.userHandle;

                return {
                  revision: revision(state, account),
                  ...(userHandle === undefined ? {} : { userHandle }),
                  credentials: rows.map((item) => ({
                    type: "public-key" as const,
                    id: item.credential.protocolCredentialId,
                  })),
                };
              }),
            )
            .pipe(Effect.mapError(() => Passkey.PasskeyUnavailable.make({}))),
      }),
      Context.add(AppAuth.strategies.passkey.SessionClaims, {
        resolve: ({ subjectId, credential }) =>
          store
            .read((state) =>
              Effect.gen(function* () {
                const account = customer(state, subjectId);

                if (account === undefined || !current(state, credential.revision))
                  return yield* Passkey.PasskeyUnavailable.make({});

                return claims(account);
              }),
            )
            .pipe(Effect.mapError(() => Passkey.PasskeyUnavailable.make({}))),
      }),
    );
  }),
);
