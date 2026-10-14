import {
  Result,
  Cause,
  Context,
  Crypto,
  DateTime,
  Effect,
  Layer,
  Schema,
  type Types,
} from "effect";
import { Base64Url } from "effect/encoding";

import { prepareCommit, hasCommitScope, type PreparedCommit } from "../hooks/commit";
import { LifecycleHooks } from "../hooks/LifecycleHooks";
import {
  HookDenied,
  LifecycleEventId,
  lifecycleEventEffect,
  lifecycleSnapshotEffect,
} from "../hooks/models";
import { IdentityConflict } from "../identity/models";
import {
  reportAuthDiagnostic,
  reportAuthFailure,
  withoutObservability,
} from "../internal/diagnostics";
import type { AuthOperationResult } from "../operations/credentials";
import { makeOperation, operationGroup } from "../operations/operation";
import type { makeRequestBinding } from "../operations/requestBinding";
import { CleanupResult } from "../persistence/cleanup";
import type { TokenDigest } from "../Schema";
import type { PrepareOAuthCommit } from "./OAuthSignInPersistence";
import type {
  OAuthRegistrationAuthentication,
  OAuthRegistrationResult,
} from "./registrationModels";
import {
  OAuthRegistrationAccess,
  OAuthRegistrationFingerprint,
  OAuthRegistrationDecision,
  OAuthRegistrationInspection,
  OAuthRegistrationIntent,
  OAuthRegistrationPrivateInput,
  registrationCompletionResult,
} from "./registrationModels";
import { credentialDigest } from "./registrationSecrets";
import { OAuthMethodUnsupported, OAuthRejected, OAuthUnavailable } from "./signInErrors";
import type { OAuthCommandId } from "./signInModels";
import { OAuthCleanupInput, OAuthModuleId } from "./signInModels";
import { freezeOAuth, makeOAuthSnapshot } from "./signInSnapshot";

const Failure = Schema.Union([
  OAuthRejected,
  OAuthUnavailable,
  OAuthMethodUnsupported,
  IdentityConflict,
  HookDenied,
]);

type Failure = typeof Failure.Type;

const registrationBoundary = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  effect.pipe(
    Effect.tapError((error) =>
      reportAuthDiagnostic(
        "oauth-registration",
        Schema.is(OAuthUnavailable)(error) ? "unavailable" : "rejected",
      ),
    ),
    Effect.tapCause((cause) =>
      Cause.hasDies(cause) ? reportAuthFailure("oauth-registration", cause) : Effect.void,
    ),
    Effect.catchDefect(() => Effect.fail(OAuthUnavailable.make({}))),
  );

export interface RegistrationModule<Id extends string, Kind extends string, Codec> {
  readonly moduleId: Id;
  readonly kind: Kind;
  readonly codec: Types.Invariant<Codec>;
}

/** Optional application registration. The first accepted owner command binds
 * application intent; callback identity, bearer and original binder stay fixed. */
export const makeOAuthRegistration = <
  const Id extends string,
  Registration extends Schema.Codec<unknown, unknown, unknown, unknown>,
  Completion extends Schema.Top,
>(
  moduleId: Id,
  codec: Registration,
  binding: ReturnType<typeof makeRequestBinding<Id, "oauth-entry">>,
  options: {
    readonly completion: Completion;
    readonly authenticate: boolean;
  },
) => {
  const { authenticate, completion } = options;

  const RegistrationCodec: Schema.Codec<
    Registration["Type"],
    Registration["Encoded"],
    Registration["DecodingServices"],
    Registration["EncodingServices"]
  > = codec;

  const CompleteInput = Schema.Struct({
    ...OAuthRegistrationPrivateInput.fields,
    registration: RegistrationCodec,
  });

  const RegistrationAuthority = Context.Service<
    RegistrationModule<Id, "authority", Registration>,
    {
      /** Only the first confirmed registration supplies its private authentication handoff. */
      readonly authentication?: "first-confirmed-registration";
      /** Nonconsuming authenticated lookup. Match both private digests, module/flow/
       * reference, immutable expiry and accepted generation. Wrong input never binds. */
      readonly read: (
        access: OAuthRegistrationAccess,
      ) => Effect.Effect<OAuthRegistrationInspection | undefined, OAuthUnavailable>;
      /** Deterministic versioned fingerprint of EVERY meaningful application field.
       * Roles/tenant/invitations require application authorization; profile email is
       * not verified. This callback receives its own detached Type graph. */
      readonly inspect: (input: {
        readonly intent: OAuthRegistrationIntent;
        readonly registration: Registration["Type"];
      }) => Effect.Effect<
        { readonly fingerprint: TokenDigest; readonly eligible: boolean },
        OAuthUnavailable
      >;
      /** One physical owner compares exact intent/access/current time and binds
       * command + fingerprint while synchronously provisioning the subject, unique
       * external identity and usable OAuth credential/shared factor. Provisioning is
       * idempotent by requestId. Never adopt an existing owner or merge by email.
       * Exact replay uses the retained intent decision without provisioning or events;
       * compare the original flow, binding, external tuple and application fingerprint.
       * Reusing a command with a different intent conflicts. An unknown commit outcome
       * never authorizes resetting the intent or provisioning again.
       */
      readonly register: <A>(
        input: {
          readonly access: OAuthRegistrationAccess;
          readonly intent: OAuthRegistrationIntent;
          readonly commandId: typeof OAuthCommandId.Type;
          readonly registration: Registration["Type"];
          /** Exact encoded bytes supplied by this registration codec, retained on first bind. */
          readonly payload: string;
          /** Stable for the durable intent; replay reads its decision before provisioning. */
          readonly requestId: string;
          readonly fingerprint: TokenDigest;
        },
        prepare: PrepareOAuthCommit<OAuthRegistrationDecision, A>,
      ) => Effect.Effect<PreparedCommit<A>, OAuthUnavailable>;
      /** Bounded authority-time/CAS cleanup of expired unbound or proven terminal
       * records only after retention. Keep the intent decision through its replay retention. */
      readonly cleanup: <A>(
        input: OAuthCleanupInput,
        prepare: PrepareOAuthCommit<CleanupResult, A>,
      ) => Effect.Effect<PreparedCommit<A>, OAuthUnavailable>;
    }
  >(`effect-auth/oauth/${moduleId.length}:${moduleId}/RegistrationAuthority`);

  type Result = AuthOperationResult<
    | typeof OAuthRegistrationResult.Type
    | { readonly _tag: "Rejected" }
    | { readonly _tag: "Conflict" }
  > & { readonly authentication?: OAuthRegistrationAuthentication };
  type Plan = {
    /** One execution under the current authority. A fresh plan is required after failure. */
    readonly commit: Effect.Effect<
      PreparedCommit<Result>,
      OAuthUnavailable | OAuthMethodUnsupported,
      typeof RegistrationAuthority.Identifier
    >;
  };

  const Registrations = Context.Service<
    RegistrationModule<Id, "registrations", Registration>,
    {
      readonly planComplete: (input: typeof CompleteInput.Type) => Effect.Effect<Plan, Failure>;
      readonly cleanup: (
        limit: number,
      ) => Effect.Effect<{ readonly removed: number; readonly hasMore: boolean }, Failure>;
    }
  >(`effect-auth/oauth/${moduleId.length}:${moduleId}/Registrations`);

  const layer = Layer.effect(
    Registrations,
    Effect.gen(function* () {
      const id = yield* Schema.decodeEffect(OAuthModuleId)(moduleId).pipe(
        Effect.mapError(() => OAuthUnavailable.make({})),
      );

      const { verify } = yield* binding.RequestBinding;
      const authority = yield* RegistrationAuthority;
      const { read, inspect, cleanup } = authority;
      const { before } = yield* LifecycleHooks;
      const crypto = yield* Crypto.Crypto;
      const { randomBytes } = crypto;

      const services = (yield* Effect.context<
        Registration["DecodingServices"] | Registration["EncodingServices"]
      >()).pipe(withoutObservability);

      const dataCodec = Schema.toCodecJson(Schema.toType(RegistrationCodec));
      const intentCodec = Schema.fromJsonString(OAuthRegistrationIntent);

      const snapshotData = Effect.fn("OAuthRegistration.snapshotData")(
        function* (value: Registration["Type"]) {
          const encoded = yield* Schema.encodeEffect(dataCodec)(value);
          const data = yield* Schema.decodeEffect(dataCodec)(encoded);

          freezeOAuth(data);

          return data;
        },
        Effect.provide(services),
        Effect.mapError(() => OAuthRejected.make({})),
      );

      const noAmbient = Effect.fn("OAuthRegistration.noAmbient")(function* () {
        if (yield* hasCommitScope) return yield* OAuthMethodUnsupported.make({});
      });

      return Registrations.of({
        planComplete: Effect.fn("OAuthRegistration.planComplete")(
          function* (raw) {
            yield* noAmbient();
            if (authenticate && authority.authentication !== "first-confirmed-registration")
              return yield* OAuthMethodUnsupported.make({});
            const input = yield* snapshotOAuthRegistrationPrivateInput.effect(raw);
            const data = yield* snapshotData(raw.registration);

            const verified = yield* verify(input.flowId, input.requestBinding).pipe(
              Effect.mapError((error) =>
                error._tag === "RequestBindingInvalid"
                  ? OAuthRejected.make({})
                  : OAuthUnavailable.make({}),
              ),
            );

            const access = yield* snapshotOAuthRegistrationAccess.effect({
              moduleId: id,
              reference: input.reference,
              flowId: input.flowId,
              requestBindingVerifier: verified.verifier,
              requestBindingExpiresAtMillis: verified.expiresAtMillis,
              credentialDigest: yield* credentialDigest(
                id,
                input.reference,
                input.flowId,
                input.credential,
              ),
            });

            const found = yield* read(yield* snapshotOAuthRegistrationAccess.effect(access));

            if (found === undefined) return yield* OAuthRejected.make({});
            const current = yield* snapshotOAuthRegistrationInspection.effect(found);
            const intent = current.intent;
            const context = intent.context;

            if (
              intent.reference !== access.reference ||
              context.moduleId !== id ||
              context.flowId !== access.flowId ||
              context.requestBindingVerifier !== access.requestBindingVerifier ||
              context.requestBindingExpiresAtMillis !== access.requestBindingExpiresAtMillis ||
              intent.credentialDigest !== access.credentialDigest ||
              intent.identity.provider !== context.provider ||
              intent.identity.issuer !== context.issuer ||
              intent.issuedAtMillis < context.issuedAtMillis ||
              intent.verifiedAtMillis > intent.issuedAtMillis ||
              (intent.upstreamAuthenticatedAt !== undefined &&
                DateTime.toEpochMillis(intent.upstreamAuthenticatedAt) < intent.verifiedAtMillis) ||
              intent.expiresAtMillis <= intent.issuedAtMillis ||
              intent.expiresAtMillis > context.requestBindingExpiresAtMillis ||
              (current.application._tag === "Unbound" &&
                intent.expiresAtMillis <= DateTime.toEpochMillis(yield* DateTime.now)) ||
              intent.retentionUntilMillis < intent.expiresAtMillis
            )
              return yield* OAuthRejected.make({});

            const inspected = yield* inspect({
              intent: yield* snapshotOAuthRegistrationIntent.effect(intent),
              registration: yield* snapshotData(data),
            });

            const checked = yield* snapshotEligibility.effect(inspected);

            const payload = yield* Schema.encodeEffect(Schema.fromJsonString(RegistrationCodec))(
              data,
            ).pipe(
              Effect.provide(services),
              Effect.mapError(() => OAuthRejected.make({})),
            );

            const requestId = "oauth-registration:" + intent.reference;
            const application = current.application;

            if (application._tag === "Unbound") {
              if (!checked.eligible) return yield* OAuthRejected.make({});
            } else if (
              application.commandId !== input.commandId ||
              application.fingerprint !== checked.fingerprint ||
              application.payload !== payload ||
              application.requestId !== requestId
            )
              return yield* IdentityConflict.make({});

            const event =
              application._tag === "Unbound"
                ? yield* Effect.gen(function* () {
                    const snapshot = yield* lifecycleSnapshotEffect({
                      action: "registration",
                      operation: `${moduleId}/oauth-registration`,
                      method: context.protocol,
                      identifiers: [],
                    }).pipe(Effect.orDie);

                    yield* before(yield* lifecycleSnapshotEffect(snapshot).pipe(Effect.orDie));

                    const bytes = yield* randomBytes(32).pipe(
                      Effect.mapError(() => OAuthUnavailable.make({})),
                    );

                    const value = yield* lifecycleEventEffect({
                      id: LifecycleEventId.make(Base64Url.encode(bytes)),
                      occurredAtMillis: DateTime.toEpochMillis(yield* DateTime.now),
                      snapshot,
                    }).pipe(Effect.orDie);

                    bytes.fill(0);

                    return value;
                  })
                : undefined;

            const ownerData = yield* snapshotData(data);

            const prepare: PrepareOAuthCommit<OAuthRegistrationDecision, Result> = prepareCommit(
              (rawDecision, journal) =>
                Result.gen(function* () {
                  const decision = snapshotOAuthRegistrationDecision.sync(rawDecision);

                  const authentication =
                    decision._tag === "Registered" && !decision.replayed && authenticate
                      ? decision.authentication
                      : undefined;

                  if (decision._tag === "Registered" && !decision.replayed) {
                    if (event === undefined) return yield* Result.fail(OAuthUnavailable.make({}));
                    if (
                      authenticate &&
                      (authentication === undefined ||
                        Schema.encodeSync(intentCodec)(authentication.intent) !==
                          Schema.encodeSync(intentCodec)(intent))
                    )
                      return yield* Result.fail(OAuthUnavailable.make({}));
                    journal.stage(event);
                  }

                  const accepted = decision._tag === "Registered";

                  return journal.prepare({
                    value:
                      decision._tag === "Registered"
                        ? { _tag: "RegistrationAccepted" as const }
                        : { _tag: decision._tag },
                    ...(authentication === undefined ? {} : { authentication }),
                    credentialCommands:
                      accepted && !decision.replayed
                        ? [
                            { _tag: "Clear" as const, slot: "registration" as const },
                            { _tag: "Clear" as const, slot: "request-binding" as const },
                          ]
                        : [],
                  });
                }),
            );

            let attempted = false;

            const commit = Effect.gen(function* () {
              if (attempted) return yield* OAuthUnavailable.make({});
              attempted = true;
              const owner = yield* RegistrationAuthority;

              if (authenticate && owner.authentication !== "first-confirmed-registration")
                return yield* OAuthMethodUnsupported.make({});

              return yield* owner.register(
                {
                  access: yield* snapshotOAuthRegistrationAccess.effect(access),
                  intent: yield* snapshotOAuthRegistrationIntent.effect(intent),
                  commandId: input.commandId,
                  registration: ownerData,
                  payload,
                  requestId,
                  fingerprint: checked.fingerprint,
                },
                prepare,
              );
            }).pipe(registrationBoundary);

            return Object.freeze({ commit });
          },
          Effect.provideService(Crypto.Crypto, crypto),
          registrationBoundary,
        ),
        cleanup: Effect.fn("OAuthRegistration.cleanup")(function* (limit) {
          yield* noAmbient();

          const input = yield* Schema.decodeEffect(OAuthCleanupInput)({
            moduleId: id,
            limit,
          }).pipe(Effect.mapError(() => OAuthRejected.make({})));

          const receipt = yield* cleanup(input, (value, journal) =>
            journal.prepare(snapshotCleanupResult.sync(value)),
          );

          return yield* receipt.read.pipe(Effect.mapError(() => OAuthUnavailable.make({})));
        }, registrationBoundary),
      });
    }),
  );

  const Complete = makeOperation(`${moduleId}/registration/complete`, {
    payload: CompleteInput,
    success: registrationCompletionResult(completion),
    error: Failure,
    access: "any",
    exposure: "public",
    replay: "single-use",
    credentials: true,
  });

  return Object.freeze({
    RegistrationCodec,
    CompleteInput,
    RegistrationAuthority,
    Registrations,
    layer,
    operations: Object.freeze({ Complete }),
    group: operationGroup(Complete),
  });
};

const snapshotOAuthRegistrationPrivateInput = makeOAuthSnapshot(OAuthRegistrationPrivateInput);
const snapshotOAuthRegistrationAccess = makeOAuthSnapshot(OAuthRegistrationAccess);
const snapshotOAuthRegistrationInspection = makeOAuthSnapshot(OAuthRegistrationInspection);
const snapshotOAuthRegistrationIntent = makeOAuthSnapshot(OAuthRegistrationIntent);
const snapshotOAuthRegistrationDecision = makeOAuthSnapshot(OAuthRegistrationDecision);
const snapshotCleanupResult = makeOAuthSnapshot(CleanupResult);

const snapshotEligibility = makeOAuthSnapshot(
  Schema.Struct({ fingerprint: OAuthRegistrationFingerprint, eligible: Schema.Boolean }),
);
