import { Context, DateTime, Effect, Layer, Schema, type Types } from "effect";

import type { PreparedCommit } from "../hooks/commit";
import { LifecycleEventId, lifecycleEvent, lifecycleSnapshot } from "../hooks/models";
import type { AuthInvocation } from "../operations/context";
import type { AuthOperationResult } from "../operations/credentials";
import { operationGroup } from "../operations/operation";
import { makeRegistration as makePasskeyRegistrationContract } from "../PasskeyContract";
import { TokenDigest } from "../Schema";
import {
  passkeyUnexpected,
  makePasskeyCeremony,
  passkeyNoAmbient,
  readPasskeyCommit,
} from "./actions";
import type { PasskeyConfigurationError, PasskeyFailure } from "./errors";
import { PasskeyRejected, PasskeyUnavailable } from "./errors";
import type {
  PasskeyCeremony,
  PasskeyClaim,
  PasskeyRegistrationComplete,
  PasskeyRegistrationStarted,
  PasskeyRegistrationVerified,
} from "./models";
import {
  PasskeyIssueDecision,
  PasskeyLabel,
  PasskeyRegistrationResult,
  PasskeyUserHandle,
} from "./models";
import type { PasskeyConfig } from "./PasskeyConfig";
import type { PreparePasskeyCommit } from "./PasskeyPersistence";
import type { PasskeyMethodPolicy } from "./policy";
import { freezePasskey, snapshotPasskey, snapshotPasskeySync } from "./snapshot";
const decision = Schema.Union([PasskeyRegistrationResult, Schema.TaggedStruct("Rejected", {})]);

const inspection = Schema.Struct({
  fingerprint: TokenDigest.check(Schema.isMaxLength(256)),
  eligible: Schema.Boolean,
  name: PasskeyLabel,
  displayName: PasskeyLabel,
});

/** Exact application registration intent is owned by the optional authority.
 * No Claims/session dependency and no registration-time authentication proof. */
export const makePasskeyRegistration = <
  const Id extends string,
  Registration extends Schema.Codec<unknown, unknown, unknown, unknown>,
>(
  moduleId: Id,
  source: Effect.Effect<PasskeyMethodPolicy, PasskeyConfigurationError, PasskeyConfig>,
  codec: Registration,
) => {
  const {
    BeginInput,
    RegistrationCodec,
    operations: { Begin, Complete },
  } = makePasskeyRegistrationContract(moduleId, codec);

  const ceremony = makePasskeyCeremony(moduleId, source, "registration");

  const RegistrationAuthority = Context.Service<
    {
      readonly moduleId: Id;
      readonly kind: "passkey-registration-authority";
      readonly registration: Types.Invariant<Registration>;
    },
    {
      readonly inspect: (
        registration: Registration["Type"],
      ) => Effect.Effect<typeof inspection.Type, PasskeyUnavailable>;
      /** Reserve exact application intent/fingerprint, random handle, challenge and
       * admission in SAME owner; no subject yet. No adoption by command/flow. */
      readonly issueRegistration: <A>(
        input: {
          readonly ceremony: PasskeyCeremony;
          readonly policy: PasskeyMethodPolicy;
          readonly registration: Registration["Type"];
        },
        prepare: PreparePasskeyCommit<PasskeyIssueDecision, A>,
      ) => Effect.Effect<PreparedCommit<A>, PasskeyUnavailable>;
      /** Exact claim/fingerprint/original reserved data; active eligible profile and
       * RP-global id/handle ownership including unresolved jobs. Atomically consume,
       * provision subject + credential/shared factor or reserve ProvisioningPending.
       * No sequential public provision call; pending retains all exact original data
       * and credential ownership before external work. Unknown never releases it.
       * Final owner clock checks expiry and all postconditions after last writes. */
      readonly completeRegistration: <A>(
        input: {
          readonly claim: PasskeyClaim;
          readonly verified: PasskeyRegistrationVerified;
          readonly nowMillis: number;
        },
        prepare: PreparePasskeyCommit<typeof decision.Type, A>,
      ) => Effect.Effect<PreparedCommit<A>, PasskeyUnavailable>;
    }
  >(`effect-auth/PasskeyRegistrationAuthority/${moduleId.length}:${moduleId}`);

  const Registrations = Context.Service<
    {
      readonly moduleId: Id;
      readonly kind: "passkey-registration";
      readonly registration: Types.Invariant<Registration>;
    },
    {
      readonly begin: (
        invocation: AuthInvocation,
        input: typeof BeginInput.Type,
      ) => Effect.Effect<AuthOperationResult<PasskeyRegistrationStarted>, PasskeyFailure>;
      readonly complete: (
        invocation: AuthInvocation,
        input: PasskeyRegistrationComplete,
      ) => Effect.Effect<AuthOperationResult<PasskeyRegistrationResult>, PasskeyFailure>;
    }
  >(`effect-auth/PasskeyRegistrations/${moduleId.length}:${moduleId}`);

  const layer = Layer.effect(
    Registrations,
    Effect.gen(function* () {
      const runtime = yield* ceremony.make,
        authority = yield* RegistrationAuthority;

      const services = yield* Effect.context<
        Registration["DecodingServices"] | Registration["EncodingServices"]
      >();

      const dataCodec = Schema.toCodecJson(Schema.toType(RegistrationCodec));

      const data = Effect.fn("PasskeyRegistration.data")(
        function* (value: Registration["Type"]) {
          const encoded = yield* Schema.encodeEffect(dataCodec)(value);
          const decoded = yield* Schema.decodeEffect(dataCodec)(encoded);

          freezePasskey(decoded);

          return decoded;
        },
        Effect.mapError(() => PasskeyUnavailable.make({})),
        Effect.provide(services),
        passkeyUnexpected,
      );

      return Registrations.of({
        begin: Effect.fn("PasskeyRegistration.begin")(
          function* (invocation, input) {
            const authority = yield* RegistrationAuthority;

            yield* passkeyNoAmbient();
            if (invocation._tag !== "Guest") return yield* PasskeyRejected.make({});
            const selected = yield* runtime.profile(input.profileId);

            if (
              !selected.primarySignIn ||
              selected.residentKey !== "required" ||
              selected.userVerification !== "required"
            )
              return yield* PasskeyRejected.make({});

            const registration = yield* data(input.registration),
              inspected = yield* snapshotPasskey(
                inspection,
                yield* authority.inspect(yield* data(registration)),
              );

            if (!inspected.eligible) return yield* PasskeyRejected.make({});

            const context = {
              _tag: "Registration" as const,
              fingerprint: inspected.fingerprint,
              userHandle: PasskeyUserHandle.make(yield* runtime.random()),
              name: inspected.name,
              displayName: inspected.displayName,
            };

            const draft = yield* runtime.prepareRegistration(input, context, []);

            const issued = yield* readPasskeyCommit(
              yield* authority.issueRegistration(
                { ceremony: draft.ceremony, policy: runtime.policy, registration },
                (value, journal) =>
                  journal.prepare(snapshotPasskeySync(PasskeyIssueDecision, value)),
              ),
            );

            return yield* runtime.acceptRegistrationIssue(draft, issued);
          },
          passkeyUnexpected,
          Effect.provideService(RegistrationAuthority, authority),
        ),
        complete: Effect.fn("PasskeyRegistration.complete")(
          function* (invocation, input) {
            yield* passkeyNoAmbient();
            if (invocation._tag !== "Guest") return yield* PasskeyRejected.make({});
            const { claim, verified } = yield* runtime.verifyRegistration(input, undefined);
            const authority = yield* RegistrationAuthority;
            const timestamp = DateTime.toEpochMillis(yield* DateTime.now);

            const result = yield* readPasskeyCommit(
              yield* authority.completeRegistration(
                { claim, verified, nowMillis: timestamp },
                (value, journal) => {
                  const projected = snapshotPasskeySync(decision, value);

                  if (projected._tag === "RegistrationAccepted")
                    journal.stage(
                      lifecycleEvent({
                        id: LifecycleEventId.make(
                          `passkey-registration/${moduleId}/${claim.ceremony.flowId}`,
                        ),
                        occurredAtMillis: timestamp,
                        snapshot: lifecycleSnapshot({
                          action: "registration",
                          operation: `${moduleId}/passkey/registration/complete`,
                          method: "passkey",
                          identifiers: [],
                        }),
                      }),
                    );

                  return journal.prepare(projected);
                },
              ),
            );

            if (result._tag === "Rejected") return yield* PasskeyRejected.make({});

            return { value: result, credentialCommands: [runtime.clear] };
          },
          passkeyUnexpected,
          Effect.provideService(RegistrationAuthority, authority),
        ),
      });
    }),
  );

  return Object.freeze({
    RegistrationAuthority,
    Registrations,
    binding: ceremony.binding,
    layer,
    operations: Object.freeze({ Begin, Complete }),
    group: operationGroup(Begin, Complete),
    handlersLayer: Layer.mergeAll(
      Begin.credentialHandlerLayer((input, invocation) =>
        Effect.flatMap(Registrations, (service) => service.begin(invocation, input)),
      ),
      Complete.credentialHandlerLayer((input, invocation) =>
        Effect.flatMap(Registrations, (service) => service.complete(invocation, input)),
      ),
    ),
  });
};
