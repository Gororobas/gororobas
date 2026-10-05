import { Context, Crypto, DateTime, Effect, Layer, Schema } from "effect";
import { Base64Url } from "effect/encoding";

import { LifecycleHooks } from "../hooks/LifecycleHooks";
import { LifecycleEventId, lifecycleEvent, lifecycleSnapshot } from "../hooks/models";
import { LastSignInMethod } from "../identity/models";
import type { AuthInvocation } from "../operations/context";
import type { AuthOperationResult } from "../operations/credentials";
import { operationGroup } from "../operations/operation";
import { makeManagement as makePasskeyManagementContract } from "../PasskeyContract";
import { TokenDigest } from "../Schema";
import { assessAuthentication } from "../sessions/assurance";
import { sessionInvalidationWindow } from "../sessions/invalidation";
import type { makeSessionModule } from "../sessions/module";
import {
  passkeyUnexpected,
  makePasskeyCeremony,
  passkeyNoAmbient,
  readPasskeyCommit,
} from "./actions";
import type { PasskeyFailure } from "./errors";
import {
  PasskeyActionRequired,
  PasskeyConfigurationError,
  PasskeyRejected,
  PasskeyUnavailable,
} from "./errors";
import type { PasskeyEnrolled, PasskeyRegistrationStarted } from "./models";
import {
  PasskeyActionAuthorization,
  PasskeyActionChallenge,
  PasskeyBegin,
  PasskeyCeremony,
  PasskeyDescriptor,
  PasskeyModuleId,
  PasskeyProfile,
  PasskeyRevision,
  PasskeyCredential,
  PasskeyCredentialSummary,
  PasskeyEnrollmentSnapshot,
  PasskeyIssueDecision,
  PasskeyLabel,
  PasskeyRemoved,
  PasskeyUserHandle,
} from "./models";
import { PasskeyActionEvidence } from "./PasskeyActionEvidence";
import type { PasskeyConfig } from "./PasskeyConfig";
import { PasskeyEnrollmentContext } from "./PasskeyEnrollmentContext";
import { PasskeyManagementPersistence } from "./PasskeyManagementPersistence";
import { PasskeyManagementPolicy, type PasskeyMethodPolicy } from "./policy";
import { snapshotPasskey, snapshotPasskeySync } from "./snapshot";

const enrollmentDecision = Schema.Union([
  Schema.TaggedStruct("Enrolled", { credential: PasskeyCredentialSummary }),
  Schema.TaggedStruct("Rejected", {}),
]);

const removeInspection = Schema.Union([
  Schema.TaggedStruct("Target", { credential: PasskeyCredential }),
  Schema.TaggedStruct("Replay", { result: PasskeyRemoved }),
  Schema.TaggedStruct("Rejected", {}),
]);

const removeDecision = Schema.Union([
  Schema.TaggedStruct("Removed", { result: PasskeyRemoved }),
  Schema.TaggedStruct("Rejected", {}),
  Schema.TaggedStruct("LastSignInMethod", {}),
]);

const renameDecision = Schema.Union([
  Schema.TaggedStruct("Renamed", {
    credential: PasskeyCredentialSummary,
    replayed: Schema.Boolean,
  }),
  Schema.TaggedStruct("Rejected", {}),
]);

const subject = Effect.fn("PasskeyManagement.subject")(function* (invocation: AuthInvocation) {
  yield* passkeyNoAmbient();
  if (invocation._tag !== "Authenticated") return yield* PasskeyRejected.make({});

  return invocation.subjectId;
}, passkeyUnexpected);

export const makePasskeyManagement = <
  const Id extends string,
  const SessionId extends string,
  Claims extends Schema.Codec<unknown, unknown, unknown, unknown>,
>(
  moduleId: Id,
  source: Effect.Effect<PasskeyMethodPolicy, PasskeyConfigurationError, PasskeyConfig>,
  input: PasskeyManagementPolicy,
  sessions: ReturnType<typeof makeSessionModule<SessionId, Claims>>,
) => {
  const captured = (() => {
    try {
      return Effect.succeed(snapshotPasskeySync(PasskeyManagementPolicy, input));
    } catch {
      return Effect.fail(PasskeyConfigurationError.make({}));
    }
  })();

  const ceremony = makePasskeyCeremony(moduleId, source, "enrollment");

  const {
    BeginInput,
    CompleteInput,
    ListInput,
    RenameInput,
    RemoveInput,
    Failure,
    listResult,
    operations: { Begin, Complete, List, Rename, Remove },
  } = makePasskeyManagementContract(moduleId);

  type Failure = typeof Failure.Type;

  const Management = Context.Service<
    { readonly moduleId: Id; readonly kind: "passkey-management" },
    {
      readonly begin: (
        invocation: AuthInvocation,
        input: typeof BeginInput.Type,
      ) => Effect.Effect<
        AuthOperationResult<typeof PasskeyRegistrationStarted.Type>,
        PasskeyFailure
      >;
      readonly complete: (
        invocation: AuthInvocation,
        input: typeof CompleteInput.Type,
      ) => Effect.Effect<AuthOperationResult<typeof PasskeyEnrolled.Type>, PasskeyFailure>;
      readonly list: (
        invocation: AuthInvocation,
        input: typeof ListInput.Type,
      ) => Effect.Effect<typeof listResult.Type, PasskeyFailure>;
      readonly rename: (
        invocation: AuthInvocation,
        input: typeof RenameInput.Type,
      ) => Effect.Effect<
        { readonly credential: typeof PasskeyCredentialSummary.Type; readonly replayed: boolean },
        PasskeyFailure
      >;
      readonly remove: (
        invocation: AuthInvocation,
        input: typeof RemoveInput.Type,
      ) => Effect.Effect<typeof PasskeyRemoved.Type, Failure>;
    }
  >(`effect-auth/PasskeyManagement/${moduleId.length}:${moduleId}`);

  const layer = Layer.effect(
    Management,
    Effect.gen(function* () {
      const policy = yield* captured,
        runtime = yield* ceremony.make,
        persistence = yield* PasskeyManagementPersistence,
        context = yield* PasskeyEnrollmentContext,
        actions = yield* PasskeyActionEvidence,
        strategy = yield* sessions.SessionStrategy,
        crypto = yield* Crypto.Crypto,
        hooks = yield* LifecycleHooks;

      if (
        policy.requireImmediateInvalidation &&
        strategy.capabilities.subjectInvalidation !== "immediate"
      )
        return yield* PasskeyConfigurationError.make({});

      const invalidation = sessionInvalidationWindow(
        "credential-change",
        strategy.capabilities,
        strategy.policy,
      );

      const digest = <S extends Schema.Codec<unknown, unknown, never, never>>(
        schema: S,
        value: S["Type"],
      ) =>
        Schema.encodeEffect(Schema.fromJsonString(Schema.toCodecJson(Schema.toType(schema))))(
          value,
        ).pipe(
          Effect.flatMap((encoded) => crypto.digest("SHA-256", new TextEncoder().encode(encoded))),
          Effect.map((bytes) => TokenDigest.make(Base64Url.encode(bytes))),
          Effect.mapError(() => PasskeyUnavailable.make({})),
        );

      const authorize = Effect.fn("PasskeyManagement.authorize")(function* (
        invocation: AuthInvocation,
        challenge: PasskeyActionChallenge,
        actionProof: typeof BeginInput.Type.actionProof,
      ) {
        const answer = yield* actions.verify({
          invocation,
          challenge,
          ...(actionProof === undefined ? {} : { proof: actionProof }),
        });

        const authorization = yield* snapshotPasskey(PasskeyActionAuthorization, {
          challenge,
          ...answer,
        });

        const evidence = authorization.evidence,
          now = yield* DateTime.now;

        if (
          String(evidence.flowId) !== String(challenge.flowId) ||
          evidence.bindingDigest !== challenge.bindingDigest ||
          evidence.revision.subjectId !== challenge.revision.subjectId ||
          evidence.revision.securityRevision !== challenge.revision.securityRevision ||
          challenge.revision.credentials.some(
            (original) =>
              !evidence.revision.credentials.some(
                (current) =>
                  current.credentialId === original.credentialId &&
                  current.revision === original.revision,
              ),
          )
        )
          return yield* PasskeyActionRequired.make({});

        const assessment = yield* assessAuthentication(evidence, authorization.requirement).pipe(
          Effect.mapError(() => PasskeyActionRequired.make({})),
        );

        if (
          !assessment.satisfied ||
          evidence.proofs.some(
            (item) =>
              DateTime.toEpochMillis(now) - DateTime.toEpochMillis(item.verifiedAt) >
              policy.maximumEvidenceAgeMillis,
          )
        )
          return yield* PasskeyActionRequired.make({});

        return authorization;
      }, passkeyUnexpected);

      const event = (
        operation: string,
        commandId: string,
        subjectId: typeof PasskeyCredential.Type.revision.subjectId,
        nowMillis: number,
      ) =>
        lifecycleEvent({
          id: LifecycleEventId.make(`passkey/${moduleId}/${operation}/${commandId}`),
          occurredAtMillis: nowMillis,
          snapshot: lifecycleSnapshot({
            action: "credential-change",
            operation: `${moduleId}/passkey/${operation}`,
            subjectId,
            method: "passkey",
            identifiers: [],
          }),
        });

      return Management.of({
        begin: Effect.fn("PasskeyManagement.begin")(
          function* (invocation, input) {
            input = yield* snapshotPasskey(Schema.toType(BeginInput), input);

            const subjectId = yield* subject(invocation),
              selected = yield* runtime.profile(input.profileId),
              captured = yield* context.capture({ moduleId, rpId: selected.rpId, subjectId });

            if (
              captured === undefined ||
              captured.revision.subjectId !== subjectId ||
              captured.credentials.length >= policy.maximumCredentials
            )
              return yield* PasskeyRejected.make({});
            const fixedCapture = yield* snapshotPasskey(PasskeyEnrollmentSnapshot, captured);

            const userHandle =
              fixedCapture.userHandle ?? PasskeyUserHandle.make(yield* runtime.random());

            const challenge = yield* snapshotPasskey(PasskeyActionChallenge, {
              moduleId,
              action: "enroll-begin",
              commandId: input.commandId,
              flowId: input.flowId,
              revision: fixedCapture.revision,
              bindingDigest: yield* digest(
                Schema.Tuple([
                  PasskeyModuleId,
                  Schema.Literal("enrollment"),
                  Schema.Struct({ ...PasskeyBegin.fields, name: PasskeyLabel }),
                  PasskeyProfile,
                  PasskeyRevision,
                  PasskeyUserHandle,
                  Schema.Array(PasskeyDescriptor),
                ]),
                [
                  moduleId,
                  "enrollment",
                  input,
                  selected,
                  fixedCapture.revision,
                  userHandle,
                  fixedCapture.credentials,
                ],
              ),
            });

            const authorization = yield* authorize(invocation, challenge, input.actionProof);

            const draft = yield* runtime.prepareRegistration(
              input,
              {
                _tag: "Enrollment",
                revision: fixedCapture.revision,
                userHandle,
                name: input.name,
                authorization,
              },
              fixedCapture.credentials,
            );

            const authority = yield* PasskeyManagementPersistence;

            const issued = yield* readPasskeyCommit(
              yield* authority.issueEnrollment(
                {
                  ceremony: draft.ceremony,
                  policy: runtime.policy,
                  management: policy,
                  authorization,
                },
                (value, journal) =>
                  journal.prepare(snapshotPasskeySync(PasskeyIssueDecision, value)),
              ),
            );

            return yield* runtime.acceptRegistrationIssue(draft, issued);
          },
          passkeyUnexpected,
          Effect.provideService(PasskeyManagementPersistence, persistence),
        ),
        complete: Effect.fn("PasskeyManagement.complete")(
          function* (invocation, input) {
            input = yield* snapshotPasskey(Schema.toType(CompleteInput), input);

            const subjectId = yield* subject(invocation),
              inspected = yield* runtime.inspect(input);

            const original = inspected.ceremony.context;

            if (original._tag !== "Enrollment" || original.revision.subjectId !== subjectId)
              return yield* PasskeyRejected.make({});

            const challenge = yield* snapshotPasskey(PasskeyActionChallenge, {
              moduleId,
              action: "enroll-complete",
              commandId: inspected.ceremony.commandId,
              flowId: input.flowId,
              revision: original.revision,
              bindingDigest: yield* digest(PasskeyCeremony, inspected.ceremony),
            });

            const authorization = yield* authorize(invocation, challenge, input.actionProof);

            const assessment = yield* assessAuthentication(
              authorization.evidence,
              original.authorization.requirement,
            ).pipe(Effect.mapError(() => PasskeyActionRequired.make({})));

            if (!assessment.satisfied) return yield* PasskeyActionRequired.make({});
            const { claim, verified } = yield* runtime.verifyRegistration(input, original);
            const authority = yield* PasskeyManagementPersistence;
            const timestamp = DateTime.toEpochMillis(yield* DateTime.now);

            const result = yield* readPasskeyCommit(
              yield* authority.completeEnrollment(
                {
                  claim,
                  verified,
                  authorization,
                  management: policy,
                  nowMillis: timestamp,
                },
                (value, journal) => {
                  const projected = snapshotPasskeySync(enrollmentDecision, value);

                  if (projected._tag === "Enrolled")
                    journal.stage(
                      event("enrollment", claim.ceremony.commandId, subjectId, timestamp),
                    );

                  return journal.prepare(projected);
                },
              ),
            );

            if (result._tag !== "Enrolled") return yield* PasskeyRejected.make({});

            return {
              value: { credential: result.credential },
              credentialCommands: [runtime.clear],
            };
          },
          passkeyUnexpected,
          Effect.provideService(PasskeyManagementPersistence, persistence),
        ),
        list: Effect.fn("PasskeyManagement.list")(function* (invocation, input) {
          const subjectId = yield* subject(invocation);
          const request = yield* snapshotPasskey(ListInput, input);

          return yield* snapshotPasskey(
            listResult,
            yield* persistence.list({ moduleId, subjectId, ...request }),
          );
        }, passkeyUnexpected),
        rename: Effect.fn("PasskeyManagement.rename")(function* (invocation, input) {
          const subjectId = yield* subject(invocation),
            request = yield* snapshotPasskey(RenameInput, input),
            timestamp = DateTime.toEpochMillis(yield* DateTime.now);

          yield* hooks.before(event("rename", request.commandId, subjectId, timestamp).snapshot);

          const result = yield* readPasskeyCommit(
            yield* persistence.rename(
              {
                moduleId,
                subjectId,
                ...request,
                nowMillis: timestamp,
                retentionUntilMillis: timestamp + runtime.policy.retentionMillis,
              },
              (value, journal) => {
                const projected = snapshotPasskeySync(renameDecision, value);

                if (projected._tag === "Renamed" && !projected.replayed)
                  journal.stage(event("rename", request.commandId, subjectId, timestamp));

                return journal.prepare(projected);
              },
            ),
          );

          if (result._tag !== "Renamed" || result.credential.credentialId !== request.credentialId)
            return yield* PasskeyRejected.make({});

          return { credential: result.credential, replayed: result.replayed };
        }, passkeyUnexpected),
        remove: Effect.fn("PasskeyManagement.remove")(function* (invocation, input) {
          const subjectId = yield* subject(invocation),
            request = yield* snapshotPasskey(Schema.toType(RemoveInput), input);

          const inspected = yield* snapshotPasskey(
            removeInspection,
            yield* persistence.inspectRemove({
              moduleId,
              subjectId,
              commandId: request.commandId,
              credentialId: request.credentialId,
            }),
          );

          if (inspected._tag === "Rejected") return yield* PasskeyRejected.make({});
          if (inspected._tag === "Replay") {
            if (
              inspected.result.credentialId !== request.credentialId ||
              !inspected.result.replayed
            )
              return yield* PasskeyUnavailable.make({});

            return inspected.result;
          }
          if (
            inspected.credential.revision.subjectId !== subjectId ||
            inspected.credential.credentialId !== request.credentialId
          )
            return yield* PasskeyRejected.make({});

          const challenge = yield* snapshotPasskey(PasskeyActionChallenge, {
            moduleId,
            action: "remove",
            commandId: request.commandId,
            flowId: Schema.decodeSync(PasskeyBegin.fields.flowId)(request.commandId),
            revision: inspected.credential.revision,
            bindingDigest: yield* digest(
              Schema.Tuple([
                PasskeyModuleId,
                Schema.Literal("remove"),
                PasskeyBegin.fields.commandId,
                PasskeyCredential,
              ]),
              [moduleId, "remove", request.commandId, inspected.credential],
            ),
          });

          const authorization = yield* authorize(invocation, challenge, request.actionProof),
            timestamp = DateTime.toEpochMillis(yield* DateTime.now);

          yield* hooks.before(event("remove", request.commandId, subjectId, timestamp).snapshot);

          const result = yield* readPasskeyCommit(
            yield* persistence.remove(
              {
                moduleId,
                commandId: request.commandId,
                credential: inspected.credential,
                authorization,
                management: policy,
                invalidation,
                nowMillis: timestamp,
                retentionUntilMillis: timestamp + runtime.policy.retentionMillis,
              },
              (value, journal) => {
                const projected = snapshotPasskeySync(removeDecision, value);

                if (projected._tag === "Removed" && !projected.result.replayed)
                  journal.stage(event("remove", request.commandId, subjectId, timestamp));

                return journal.prepare(projected);
              },
            ),
          );

          if (result._tag === "LastSignInMethod") return yield* LastSignInMethod.make({});
          if (result._tag !== "Removed" || result.result.credentialId !== request.credentialId)
            return yield* PasskeyRejected.make({});

          return result.result;
        }, passkeyUnexpected),
      });
    }),
  );

  return Object.freeze({
    Management,
    binding: ceremony.binding,
    layer,
    operations: Object.freeze({ Begin, Complete, List, Rename, Remove }),
    group: operationGroup(Begin, Complete, List, Rename, Remove),
    handlersLayer: Layer.mergeAll(
      Begin.credentialHandlerLayer((input, invocation) =>
        Effect.flatMap(Management, (service) => service.begin(invocation, input)),
      ),
      Complete.credentialHandlerLayer((input, invocation) =>
        Effect.flatMap(Management, (service) => service.complete(invocation, input)),
      ),
      List.handlerLayer((input, invocation) =>
        Effect.flatMap(Management, (service) => service.list(invocation, input)),
      ),
      Rename.handlerLayer((input, invocation) =>
        Effect.flatMap(Management, (service) => service.rename(invocation, input)),
      ),
      Remove.handlerLayer((input, invocation) =>
        Effect.flatMap(Management, (service) => service.remove(invocation, input)),
      ),
    ),
  });
};
