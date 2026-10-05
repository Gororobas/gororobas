import { Passkey, Schema as AuthSchema, Sessions } from "@yielded/auth";
import { Context, Crypto, Effect, Layer, Schema } from "effect";
import { Base64Url } from "effect/encoding";

import { requirement } from "../../shared/account/auth";
import {
  claims,
  credentials,
  current,
  customer,
  evidenceDeadline,
  revision,
  satisfies,
} from "./accounts";
import { AppAuth } from "./auth";
import { charge, nextId, type State } from "./model";
import { AccountStore } from "./store";

const encodeCeremony = Schema.encodeSync(Schema.fromJsonString(Passkey.PasskeyCeremony));
const encodeClaim = Schema.encodeSync(Schema.fromJsonString(Passkey.PasskeyClaim));
const encodePolicy = Schema.encodeSync(Schema.fromJsonString(Passkey.PasskeyMethodPolicy));
const encodeProfile = Schema.encodeSync(Schema.fromJsonString(Passkey.PasskeyProfile));

const encodeAuthorization = Schema.encodeSync(
  Schema.fromJsonString(Passkey.PasskeyActionAuthorization),
);

const managementId = AppAuth.strategies.passkeys.persistence.moduleId;
const signInId = AppAuth.strategies.passkey.persistence.moduleId;
const management = AppAuth.strategies.passkeys.persistence.managementPolicy;

type Row = State["ceremonies"][number];

const knownSubject = (ceremony: Passkey.PasskeyCeremony) =>
  ceremony.context._tag === "Enrollment" ? ceremony.context.revision.subjectId : undefined;

const live = (ceremony: Passkey.PasskeyCeremony, now: number, claim?: Passkey.PasskeyClaim) =>
  now >= ceremony.issuedAtMillis &&
  now < ceremony.expiresAtMillis &&
  now < ceremony.requestBindingExpiresAtMillis &&
  (claim === undefined || (now >= claim.claimedAtMillis && now < claim.claimExpiresAtMillis));

const matches = (ceremony: Passkey.PasskeyCeremony, access: Passkey.PasskeyAccess) =>
  ceremony.moduleId === access.moduleId &&
  ceremony.generation === access.generation &&
  ceremony.purpose === access.purpose &&
  ceremony.flowId === access.flowId &&
  ceremony.requestBindingVerifier === access.requestBindingVerifier &&
  ceremony.requestBindingExpiresAtMillis === access.requestBindingExpiresAtMillis;

const exactSubject = (state: Readonly<State>, snapshot: typeof Passkey.PasskeyRevision.Type) =>
  current(state, snapshot) &&
  credentials(state, snapshot.subjectId).length === snapshot.credentials.length &&
  new Set(snapshot.credentials.map((item) => item.credentialId)).size ===
    snapshot.credentials.length;

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
        revision: revision(state, account, [saved.credential.credentialId]),
      };
};

const sameCredential = (a: Passkey.PasskeyCredential, b: Passkey.PasskeyCredential) =>
  a.credentialId === b.credentialId &&
  a.rpId === b.rpId &&
  a.protocolCredentialId === b.protocolCredentialId &&
  a.userHandle === b.userHandle &&
  a.publicKey === b.publicKey &&
  a.algorithm === b.algorithm &&
  a.active === b.active &&
  a.primarySignIn === b.primarySignIn &&
  a.enrollmentUserVerified === b.enrollmentUserVerified &&
  a.backupEligible === b.backupEligible &&
  encodeProfile(a.profile) === encodeProfile(b.profile) &&
  a.revision.subjectId === b.revision.subjectId &&
  a.revision.securityRevision === b.revision.securityRevision &&
  a.revision.credentials.length === b.revision.credentials.length &&
  a.revision.credentials.every((item) =>
    b.revision.credentials.some(
      (other) => item.credentialId === other.credentialId && item.revision === other.revision,
    ),
  );

export const PasskeysLive = Layer.effectContext(
  Effect.gen(function* () {
    const store = yield* AccountStore;
    const crypto = yield* Crypto.Crypto;
    const signInPolicy = yield* AppAuth.strategies.passkey.persistence.policy;
    const enrollmentPolicy = yield* AppAuth.strategies.passkeys.persistence.policy;

    const policyFor = (moduleId: string) =>
      moduleId === signInId
        ? signInPolicy
        : moduleId === managementId
          ? enrollmentPolicy
          : undefined;

    const compatible = (ceremony: Passkey.PasskeyCeremony, policy: Passkey.PasskeyMethodPolicy) => {
      const configured = policyFor(ceremony.moduleId);

      return (
        configured !== undefined &&
        encodePolicy(configured) === encodePolicy(policy) &&
        ceremony.generation === configured.generation &&
        ceremony.claimLifetimeMillis === policy.claimLifetimeMillis &&
        configured.profiles.some(
          (profile) => encodeProfile(profile) === encodeProfile(ceremony.profile),
        ) &&
        ceremony.expiresAtMillis > ceremony.issuedAtMillis &&
        ceremony.expiresAtMillis <= ceremony.requestBindingExpiresAtMillis &&
        ceremony.expiresAtMillis - ceremony.issuedAtMillis <= policy.lifetimeMillis &&
        ceremony.retentionUntilMillis === ceremony.issuedAtMillis + policy.retentionMillis &&
        ((ceremony.moduleId === signInId &&
          ceremony.context._tag === "SignIn" &&
          ceremony.purpose === "sign-in") ||
          (ceremony.moduleId === managementId &&
            ceremony.context._tag === "Enrollment" &&
            ceremony.purpose === "enrollment"))
      );
    };

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

    const admitted = (
      state: State,
      ceremony: Passkey.PasskeyCeremony,
      policy: Passkey.PasskeyMethodPolicy,
      now: number,
    ) => {
      if (
        state.ceremonies.some(
          (row) =>
            row.ceremony.moduleId === ceremony.moduleId &&
            (row.ceremony.flowId === ceremony.flowId ||
              row.ceremony.commandId === ceremony.commandId),
        )
      )
        return false;
      const subjectId = knownSubject(ceremony);

      const budgets = [
        { bucket: `passkey/${ceremony.moduleId}/global`, ...policy.admission.global },
        ...(subjectId === undefined
          ? []
          : [
              {
                bucket: `passkey/${ceremony.moduleId}/subject/${subjectId}`,
                ...policy.admission.subject,
              },
            ]),
      ];

      const accepted = charge(state, budgets, now);

      const pending = state.ceremonies.filter(
        (row) =>
          row.ceremony.moduleId === ceremony.moduleId &&
          (row.state === "pending" || row.state === "claimed") &&
          live(row.ceremony, now),
      );

      return (
        accepted &&
        pending.length < policy.maximumPending &&
        (subjectId === undefined ||
          pending.filter((row) => knownSubject(row.ceremony) === subjectId).length <
            policy.maximumPendingPerSubject)
      );
    };

    const exactClaim = (state: Readonly<State>, claim: Passkey.PasskeyClaim) =>
      state.ceremonies.find(
        (row) =>
          row.state === "claimed" &&
          row.claim !== undefined &&
          encodeClaim(row.claim) === encodeClaim(claim),
      );

    const terminal = (state: State, row: Row, status: Row["state"]) => {
      state.ceremonies = state.ceremonies.map((item) =>
        item === row ? { ...item, state: status } : item,
      );
    };

    const persistence = Passkey.PasskeyPersistence.of({
      issue: (input, prepare) =>
        store
          .transaction((state, journal, now) =>
            Effect.sync(() => {
              if (
                input.ceremony.purpose !== "sign-in" ||
                input.ceremony.allowedCredentials.length !== 0 ||
                !compatible(input.ceremony, input.policy) ||
                !live(input.ceremony, now) ||
                !admitted(state, input.ceremony, input.policy, now)
              )
                return prepare({ _tag: "Rejected" }, journal);
              const receipt = prepare({ _tag: "Issued", ceremony: input.ceremony }, journal);

              journal.beforeCommit((time) => live(input.ceremony, time));
              state.ceremonies = [
                ...state.ceremonies,
                { ceremony: input.ceremony, policy: input.policy, state: "pending" },
              ];

              return receipt;
            }),
          )
          .pipe(Effect.catchTag("StoreUnavailable", () => Passkey.PasskeyUnavailable.make({}))),
      context: (access) =>
        store
          .read((state, now) =>
            Effect.sync(() => {
              const row = state.ceremonies.find(
                (row) =>
                  row.state === "pending" &&
                  matches(row.ceremony, access) &&
                  compatible(row.ceremony, row.policy) &&
                  live(row.ceremony, now),
              );

              return row?.ceremony;
            }),
          )
          .pipe(Effect.catchTag("StoreUnavailable", () => Passkey.PasskeyUnavailable.make({}))),
      claim: (input, prepare) =>
        store
          .transaction((state, journal, now) =>
            Effect.sync(() => {
              const row = state.ceremonies.find(
                (row) => row.state === "pending" && matches(row.ceremony, input.access),
              );

              const captured = input.credential;

              const actual =
                captured === undefined
                  ? undefined
                  : credentialFor(state, captured.rpId, captured.protocolCredentialId);

              if (
                row === undefined ||
                !compatible(row.ceremony, row.policy) ||
                encodePolicy(row.policy) !== encodePolicy(input.policy) ||
                !live(row.ceremony, now) ||
                encodeCeremony(row.ceremony) !== encodeCeremony(input.ceremony)
              )
                return prepare({ _tag: "Rejected" }, journal);
              if (row.ceremony.purpose === "sign-in") {
                if (
                  captured === undefined ||
                  actual === undefined ||
                  !sameCredential(actual, captured) ||
                  !actual.primarySignIn ||
                  !actual.enrollmentUserVerified ||
                  encodeProfile(actual.profile) !== encodeProfile(row.ceremony.profile) ||
                  state.ceremonies.filter(
                    (other) =>
                      other.state === "claimed" &&
                      other.ceremony.moduleId === signInId &&
                      other.credential?.revision.subjectId === actual.revision.subjectId &&
                      live(other.ceremony, now, other.claim),
                  ).length >= row.policy.maximumPendingPerSubject ||
                  !charge(
                    state,
                    [
                      {
                        bucket: `passkey/${signInId}/subject/${actual.revision.subjectId}`,
                        ...row.policy.admission.subject,
                      },
                    ],
                    now,
                  )
                ) {
                  terminal(state, row, "rejected");

                  return prepare({ _tag: "Rejected" }, journal);
                }
              } else if (
                captured !== undefined ||
                row.ceremony.context._tag !== "Enrollment" ||
                !exactSubject(state, row.ceremony.context.revision)
              ) {
                terminal(state, row, "rejected");

                return prepare({ _tag: "Rejected" }, journal);
              }

              const claim = Passkey.PasskeyClaim.make({
                ceremony: row.ceremony,
                claimId: input.claimId,
                claimedAtMillis: now,
                claimExpiresAtMillis: Math.min(
                  now + row.policy.claimLifetimeMillis,
                  row.ceremony.expiresAtMillis,
                  row.ceremony.requestBindingExpiresAtMillis,
                ),
              });

              const receipt = prepare({ _tag: "Claimed", claim }, journal);

              journal.beforeCommit((time) => live(row.ceremony, time, claim));
              state.ceremonies = state.ceremonies.map((item) =>
                item === row
                  ? {
                      ...item,
                      state: "claimed",
                      claim,
                      ...(captured === undefined ? {} : { credential: captured }),
                    }
                  : item,
              );

              return receipt;
            }),
          )
          .pipe(Effect.catchTag("StoreUnavailable", () => Passkey.PasskeyUnavailable.make({}))),
      settle: (input, prepare) =>
        store
          .transaction((state, journal, now) =>
            Effect.sync(() => {
              const row = exactClaim(state, input.claim);

              if (row === undefined) return prepare("Rejected", journal);
              const { outcome } = input;

              if (outcome._tag !== "Assertion") {
                terminal(state, row, outcome._tag === "Ambiguous" ? "ambiguous" : "rejected");

                return prepare(outcome._tag, journal);
              }

              const actual = credentialFor(
                state,
                outcome.credential.rpId,
                outcome.credential.protocolCredentialId,
              );

              const assertion = outcome.assertion;

              const accepted =
                row.ceremony.purpose === "sign-in" &&
                live(row.ceremony, now, input.claim) &&
                compatible(row.ceremony, row.policy) &&
                actual !== undefined &&
                row.credential !== undefined &&
                sameCredential(row.credential, outcome.credential) &&
                sameCredential(actual, outcome.credential) &&
                current(state, outcome.evidence.revision) &&
                outcome.evidence.revision.subjectId === actual.revision.subjectId &&
                assertion.protocolCredentialId === actual.protocolCredentialId &&
                (assertion.userHandle === undefined ||
                  assertion.userHandle === actual.userHandle) &&
                assertion.backupEligible === actual.backupEligible &&
                (!assertion.backupState || assertion.backupEligible) &&
                (row.ceremony.profile.userVerification !== "required" || assertion.userVerified) &&
                (actual.backupEligible ||
                  (actual.counter === 0 && assertion.counter === 0) ||
                  assertion.counter > actual.counter);

              terminal(state, row, accepted ? "verified" : "rejected");
              const receipt = prepare(accepted ? "Verified" : "Rejected", journal);

              if (accepted) journal.beforeCommit((time) => live(row.ceremony, time, input.claim));
              if (accepted && actual !== undefined)
                state.passkeys = state.passkeys.map((item) =>
                  item.credential.credentialId === actual.credentialId
                    ? {
                        credential: {
                          ...item.credential,
                          counter: actual.backupEligible
                            ? Math.max(actual.counter, assertion.counter)
                            : assertion.counter,
                          maximumCounter: Math.max(actual.maximumCounter, assertion.counter),
                          backupState: assertion.backupState,
                        },
                        summary: { ...item.summary, lastUsedAtMillis: now },
                      }
                    : item,
                );

              return receipt;
            }),
          )
          .pipe(Effect.catchTag("StoreUnavailable", () => Passkey.PasskeyUnavailable.make({}))),
      cleanup: (input, prepare) =>
        store
          .transaction((state, journal, now) =>
            Effect.sync(() => {
              let terminalized = 0;
              let removed = 0;
              let hasMore = false;

              state.ceremonies = state.ceremonies.flatMap((row) => {
                if (row.ceremony.moduleId !== input.moduleId) return [row];

                const expired =
                  (row.state === "pending" || row.state === "claimed") &&
                  !live(row.ceremony, now, row.claim);

                const erase = row.ceremony.retentionUntilMillis <= now;

                if (!expired && !erase) return [row];
                if (terminalized + removed >= input.limit) {
                  hasMore = true;

                  return [row];
                }
                if (erase) {
                  removed++;

                  return [];
                }
                terminalized++;

                return [
                  {
                    ...row,
                    state: row.state === "claimed" ? ("ambiguous" as const) : ("rejected" as const),
                  },
                ];
              });

              return prepare({ terminalized, removed, hasMore }, journal);
            }),
          )
          .pipe(Effect.catchTag("StoreUnavailable", () => Passkey.PasskeyUnavailable.make({}))),
    });

    const metadataAllowed = (
      state: Readonly<State>,
      moduleId: string,
      subjectId: AuthSchema.SubjectId,
    ) => moduleId === managementId && customer(state, subjectId) !== undefined;

    const manager = Passkey.PasskeyManagementPersistence.of({
      list: (input) =>
        store
          .read((state) =>
            Effect.gen(function* () {
              if (!metadataAllowed(state, input.moduleId, input.subjectId))
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
          .pipe(Effect.catchTag("StoreUnavailable", () => Passkey.PasskeyUnavailable.make({}))),
      issueEnrollment: (input, prepare) =>
        store
          .transaction((state, journal, now) =>
            Effect.gen(function* () {
              const { ceremony } = input;
              const context = ceremony.context;

              if (
                context._tag !== "Enrollment" ||
                !compatible(ceremony, input.policy) ||
                !live(ceremony, now) ||
                !exactSubject(state, context.revision)
              )
                return prepare({ _tag: "Rejected" }, journal);

              const rows = state.passkeys.filter(
                (row) =>
                  row.credential.active &&
                  row.credential.revision.subjectId === context.revision.subjectId,
              );

              const excluded = rows.filter((row) => row.credential.rpId === ceremony.profile.rpId);

              const handle = state.handles.find(
                (row) =>
                  row.rpId === ceremony.profile.rpId &&
                  row.subjectId === context.revision.subjectId,
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
                excluded.length !== ceremony.allowedCredentials.length ||
                !excluded.every((row) =>
                  ceremony.allowedCredentials.some(
                    (item) => item.id === row.credential.protocolCredentialId,
                  ),
                ) ||
                (handle !== undefined && handle.handle !== context.userHandle) ||
                state.handles.some(
                  (row) =>
                    row.rpId === ceremony.profile.rpId &&
                    row.handle === context.userHandle &&
                    row.subjectId !== context.revision.subjectId,
                ) ||
                encodeAuthorization(context.authorization) !==
                  encodeAuthorization(input.authorization) ||
                !(yield* authorize(
                  state,
                  input.authorization,
                  {
                    action: "enroll-begin",
                    commandId: ceremony.commandId,
                    flowId: ceremony.flowId,
                    digest: expectedDigest,
                    revision: context.revision,
                  },
                  Math.min(
                    management.maximumEvidenceAgeMillis,
                    input.management.maximumEvidenceAgeMillis,
                  ),
                )) ||
                !admitted(state, ceremony, input.policy, now)
              )
                return prepare({ _tag: "Rejected" }, journal);
              const receipt = prepare({ _tag: "Issued", ceremony }, journal);

              journal.beforeCommit(
                (time) =>
                  live(ceremony, time) &&
                  time <
                    evidenceDeadline(input.authorization.evidence, {
                      ...input.authorization.requirement,
                      maximumAgeMillis: Math.min(
                        input.authorization.requirement.maximumAgeMillis,
                        management.maximumEvidenceAgeMillis,
                        input.management.maximumEvidenceAgeMillis,
                      ),
                    }),
              );
              if (handle === undefined)
                state.handles = [
                  ...state.handles,
                  {
                    rpId: ceremony.profile.rpId,
                    subjectId: context.revision.subjectId,
                    handle: context.userHandle,
                  },
                ];
              state.ceremonies = [
                ...state.ceremonies,
                { ceremony, policy: input.policy, state: "pending" },
              ];

              return receipt;
            }),
          )
          .pipe(Effect.mapError(() => Passkey.PasskeyUnavailable.make({}))),
      completeEnrollment: (input, prepare) =>
        store
          .transaction((state, journal, now) =>
            Effect.gen(function* () {
              const row = exactClaim(state, input.claim);

              if (row === undefined) return prepare({ _tag: "Rejected" }, journal);
              const { ceremony } = row;
              const context = ceremony.context;
              const verified = input.verified;

              const reject = () => {
                terminal(state, row, "rejected");

                return prepare({ _tag: "Rejected" }, journal);
              };

              if (
                context._tag !== "Enrollment" ||
                !compatible(ceremony, row.policy) ||
                !live(ceremony, now, input.claim) ||
                !exactSubject(state, context.revision)
              )
                return reject();

              const rows = state.passkeys.filter(
                (item) =>
                  item.credential.active &&
                  item.credential.revision.subjectId === context.revision.subjectId,
              );

              if (
                rows.length >=
                  Math.min(management.maximumCredentials, input.management.maximumCredentials) ||
                !state.handles.some(
                  (item) =>
                    item.rpId === ceremony.profile.rpId &&
                    item.subjectId === context.revision.subjectId &&
                    item.handle === context.userHandle,
                ) ||
                state.passkeys.some(
                  (item) =>
                    item.credential.rpId === ceremony.profile.rpId &&
                    item.credential.protocolCredentialId === verified.protocolCredentialId,
                ) ||
                !ceremony.profile.algorithms.includes(verified.algorithm) ||
                (!verified.backupEligible && verified.backupState) ||
                (ceremony.profile.userVerification === "required" && !verified.userVerified) ||
                !(yield* satisfies(
                  state,
                  input.authorization.evidence,
                  context.authorization.requirement,
                )) ||
                !(yield* authorize(
                  state,
                  input.authorization,
                  {
                    action: "enroll-complete",
                    commandId: ceremony.commandId,
                    flowId: ceremony.flowId,
                    digest: yield* digest(Passkey.PasskeyCeremony, ceremony),
                    revision: context.revision,
                  },
                  Math.min(
                    management.maximumEvidenceAgeMillis,
                    input.management.maximumEvidenceAgeMillis,
                  ),
                ))
              )
                return reject();
              const id = nextId(state, "passkey");

              const credential = Passkey.PasskeyCredential.make({
                credentialId: id,
                rpId: ceremony.profile.rpId,
                protocolCredentialId: verified.protocolCredentialId,
                userHandle: context.userHandle,
                publicKey: verified.publicKey,
                algorithm: verified.algorithm,
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
                primarySignIn: ceremony.profile.primarySignIn && verified.userVerified,
                enrollmentUserVerified: verified.userVerified,
                backupEligible: verified.backupEligible,
                backupState: verified.backupState,
                counter: verified.counter,
                maximumCounter: verified.counter,
              });

              const summary = {
                credentialId: id,
                name: "Passkey",
                primarySignIn: credential.primarySignIn,
                createdAtMillis: now,
              };

              const receipt = prepare({ _tag: "Enrolled", credential: summary }, journal);

              journal.beforeCommit(
                (time) =>
                  live(ceremony, time, input.claim) &&
                  time <
                    evidenceDeadline(input.authorization.evidence, {
                      ...input.authorization.requirement,
                      maximumAgeMillis: Math.min(
                        input.authorization.requirement.maximumAgeMillis,
                        context.authorization.requirement.maximumAgeMillis,
                        management.maximumEvidenceAgeMillis,
                        input.management.maximumEvidenceAgeMillis,
                      ),
                    }),
              );
              state.passkeys = [...state.passkeys, { credential, summary }];
              terminal(state, row, "verified");

              return receipt;
            }),
          )
          .pipe(Effect.mapError(() => Passkey.PasskeyUnavailable.make({}))),
      rename: (input, prepare) =>
        store
          .transaction((state, journal, now) =>
            Effect.sync(() => {
              if (!metadataAllowed(state, input.moduleId, input.subjectId))
                return prepare({ _tag: "Rejected" }, journal);

              const row = state.passkeys.find(
                (item) =>
                  item.credential.active &&
                  item.credential.credentialId === input.credentialId &&
                  item.credential.revision.subjectId === input.subjectId,
              );

              if (row === undefined) return prepare({ _tag: "Rejected" }, journal);

              const previous = state.renames.find(
                (item) =>
                  item.moduleId === input.moduleId &&
                  item.commandId === input.commandId &&
                  item.retentionUntil > now,
              );

              if (previous !== undefined)
                return prepare(
                  previous.subjectId === input.subjectId &&
                    previous.name === input.name &&
                    previous.result.credentialId === input.credentialId
                    ? { _tag: "Renamed", credential: previous.result, replayed: true }
                    : { _tag: "Rejected" },
                  journal,
                );
              const summary = { ...row.summary, name: input.name };

              const receipt = prepare(
                { _tag: "Renamed", credential: summary, replayed: false },
                journal,
              );

              state.passkeys = state.passkeys.map((item) =>
                item === row ? { ...item, summary } : item,
              );
              state.renames = [
                ...state.renames.filter((item) => item.retentionUntil > now),
                {
                  moduleId: input.moduleId,
                  commandId: input.commandId,
                  subjectId: input.subjectId,
                  name: input.name,
                  result: summary,
                  retentionUntil: input.retentionUntilMillis,
                },
              ];

              return receipt;
            }),
          )
          .pipe(Effect.catchTag("StoreUnavailable", () => Passkey.PasskeyUnavailable.make({}))),
      // Removal is deliberately not an operation of this app's public contract.
      inspectRemove: () => Effect.succeed({ _tag: "Rejected" }),
      remove: (_input, prepare) =>
        store
          .transaction((_state, journal) => Effect.succeed(prepare({ _tag: "Rejected" }, journal)))
          .pipe(Effect.catchTag("StoreUnavailable", () => Passkey.PasskeyUnavailable.make({}))),
    });

    return Context.make(Passkey.PasskeyPersistence, persistence).pipe(
      Context.add(Passkey.PasskeyManagementPersistence, manager),
      Context.add(Passkey.PasskeyCredentials, {
        lookup: (input) =>
          store
            .read((state) =>
              Effect.succeed(credentialFor(state, input.rpId, input.protocolCredentialId)),
            )
            .pipe(Effect.catchTag("StoreUnavailable", () => Passkey.PasskeyUnavailable.make({}))),
      }),
      Context.add(Passkey.PasskeyEnrollmentContext, {
        capture: (input) =>
          store
            .read((state) =>
              Effect.sync(() => {
                const account = customer(state, input.subjectId);

                if (account === undefined || input.moduleId !== managementId) return undefined;

                const handle = state.handles.find(
                  (item) => item.rpId === input.rpId && item.subjectId === input.subjectId,
                );

                return {
                  revision: revision(state, account),
                  ...(handle === undefined ? {} : { userHandle: handle.handle }),
                  credentials: state.passkeys
                    .filter(
                      (item) =>
                        item.credential.active &&
                        item.credential.rpId === input.rpId &&
                        item.credential.revision.subjectId === input.subjectId,
                    )
                    .map((item) => ({
                      type: "public-key" as const,
                      id: item.credential.protocolCredentialId,
                    })),
                };
              }),
            )
            .pipe(Effect.catchTag("StoreUnavailable", () => Passkey.PasskeyUnavailable.make({}))),
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
            .pipe(Effect.catchTag("StoreUnavailable", () => Passkey.PasskeyUnavailable.make({}))),
      }),
    );
  }),
);
