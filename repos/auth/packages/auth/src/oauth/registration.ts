import { Cause, Context, Crypto, DateTime, Effect, Layer, Schema, type Types } from "effect";
import { Base64Url } from "effect/encoding";

import { hasCommitScope, type PreparedCommit } from "../hooks/commit";
import { LifecycleHooks } from "../hooks/LifecycleHooks";
import { HookDenied, LifecycleEventId, lifecycleEvent, lifecycleSnapshot } from "../hooks/models";
import { IdentityConflict } from "../identity/models";
import { reportAuthFailure } from "../internal/diagnostics";
import type { AuthOperationResult } from "../operations/credentials";
import { makeOperation, operationGroup } from "../operations/operation";
import type { makeRequestBinding } from "../operations/requestBinding";
import type { TokenDigest } from "../Schema";
import type { PrepareOAuthCommit } from "./OAuthSignInPersistence";
import {
  OAuthRegistrationAccess,
  OAuthRegistrationFingerprint,
  OAuthRegistrationDecision,
  OAuthRegistrationInspection,
  OAuthRegistrationIntent,
  OAuthRegistrationPrivateInput,
  OAuthRegistrationResult,
} from "./registrationModels";
import { credentialDigest } from "./registrationSecrets";
import { OAuthMethodUnsupported, OAuthRejected, OAuthUnavailable } from "./signInErrors";
import type { OAuthCommandId } from "./signInModels";
import { OAuthCleanupInput, OAuthModuleId } from "./signInModels";
import { freezeOAuth, snapshotOAuthSync } from "./signInSnapshot";

const Failure = Schema.Union([
  OAuthRejected,
  OAuthUnavailable,
  OAuthMethodUnsupported,
  IdentityConflict,
  HookDenied,
]);

type Failure = typeof Failure.Type;

const unexpected = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  effect.pipe(
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
>(
  moduleId: Id,
  codec: Registration,
  binding: ReturnType<typeof makeRequestBinding<Id, "oauth-entry">>,
) => {
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
      /** One physical owner compares exact intent/access/current time and first binds
       * command + fingerprint while provisioning subject + unique full external tuple
       * + usable OAuth credential/shared factor, or recording protected pending work.
       * Before external work, pending must reserve the full external tuple across
       * ALL intents and provisioning jobs in this same owner. Pending-vs-pending and
       * pending-vs-registration races have one winner and one stable provisioning
       * identity; an unresolved reservation is never released by bearer expiry.
       * No orphan, email merge, existing-owner adoption or generic provision-then-bind.
       * Final eligibility/uniqueness is authoritative. No standalone Bound state.
       * Exact replay returns stored metadata with replayed=true, without provisioning
       * or events. Replay equality includes the complete immutable intent (reference,
       * original flow/binder and external tuple), not only its application fingerprint.
       * Reusing a module/command for a different intent or data conflicts. Unknown is
       * never rollback/reset.
       * Pending preserves exact application data and stable provisioning identity
       * BEFORE external work; its reference grants no recovery authority. Prepare and
       * declarative provisioning snapshots are synchronous and precede physical commit.
       */
      readonly register: <A>(
        input: {
          readonly access: OAuthRegistrationAccess;
          readonly intent: OAuthRegistrationIntent;
          readonly commandId: typeof OAuthCommandId.Type;
          readonly registration: Registration["Type"];
          readonly fingerprint: TokenDigest;
        },
        prepare: PrepareOAuthCommit<OAuthRegistrationDecision, A>,
      ) => Effect.Effect<PreparedCommit<A>, OAuthUnavailable>;
      /** Bounded authority-time/CAS cleanup of expired unbound or proven terminal
       * records only after retention. Never remove unresolved ProvisioningPending. */
      readonly cleanup: <A>(
        input: OAuthCleanupInput,
        prepare: PrepareOAuthCommit<{ readonly removed: number; readonly hasMore: boolean }, A>,
      ) => Effect.Effect<PreparedCommit<A>, OAuthUnavailable>;
    }
  >(`effect-auth/oauth/${moduleId.length}:${moduleId}/RegistrationAuthority`);

  type Result = AuthOperationResult<
    | typeof OAuthRegistrationResult.Type
    | { readonly _tag: "Rejected" }
    | { readonly _tag: "Conflict" }
  >;
  type Plan = {
    /** One execution under the current authority. A fresh plan is required after failure. */
    readonly commit: Effect.Effect<
      PreparedCommit<Result>,
      OAuthUnavailable,
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
      const { read, inspect, cleanup } = yield* RegistrationAuthority;
      const { before } = yield* LifecycleHooks;
      const crypto = yield* Crypto.Crypto;
      const { randomBytes } = crypto;

      const services = yield* Effect.context<
        Registration["DecodingServices"] | Registration["EncodingServices"]
      >();

      const dataCodec = Schema.toCodecJson(Schema.toType(RegistrationCodec));

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
            const input = snapshotOAuthSync(OAuthRegistrationPrivateInput, raw);
            const data = yield* snapshotData(raw.registration);

            const verified = yield* verify(input.flowId, input.requestBinding).pipe(
              Effect.mapError((error) =>
                error._tag === "RequestBindingInvalid"
                  ? OAuthRejected.make({})
                  : OAuthUnavailable.make({}),
              ),
            );

            const access = snapshotOAuthSync(OAuthRegistrationAccess, {
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
              nowMillis: DateTime.toEpochMillis(yield* DateTime.now),
            });

            const found = yield* read(snapshotOAuthSync(OAuthRegistrationAccess, access));

            if (found === undefined) return yield* OAuthRejected.make({});
            const current = snapshotOAuthSync(OAuthRegistrationInspection, found);
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
              intent.claimedAtMillis < context.issuedAtMillis ||
              intent.claimedAtMillis >= context.expiresAtMillis ||
              intent.issuedAtMillis < intent.claimedAtMillis ||
              intent.verifiedAtMillis > intent.issuedAtMillis ||
              intent.expiresAtMillis <= intent.issuedAtMillis ||
              intent.expiresAtMillis > context.requestBindingExpiresAtMillis ||
              intent.expiresAtMillis <= access.nowMillis ||
              intent.retentionUntilMillis < intent.expiresAtMillis
            )
              return yield* OAuthRejected.make({});

            const inspected = yield* inspect({
              intent: snapshotOAuthSync(OAuthRegistrationIntent, intent),
              registration: yield* snapshotData(data),
            });

            const checked = snapshotOAuthSync(
              Schema.Struct({
                fingerprint: OAuthRegistrationFingerprint,
                eligible: Schema.Boolean,
              }),
              inspected,
            );

            const application = current.application;

            if (application._tag === "Unbound") {
              if (!checked.eligible) return yield* OAuthRejected.make({});
            } else if (
              application.commandId !== input.commandId ||
              application.fingerprint !== checked.fingerprint
            )
              return yield* IdentityConflict.make({});

            const snapshot = lifecycleSnapshot({
              action: "registration",
              operation: `${moduleId}/oauth-registration`,
              method: context.protocol,
              identifiers: [],
            });

            if (application._tag === "Unbound") yield* before(lifecycleSnapshot(snapshot));

            const eventBytes = yield* randomBytes(32).pipe(
              Effect.mapError(() => OAuthUnavailable.make({})),
            );

            const event = lifecycleEvent({
              id: LifecycleEventId.make(Base64Url.encode(eventBytes)),
              occurredAtMillis: DateTime.toEpochMillis(yield* DateTime.now),
              snapshot,
            });

            eventBytes.fill(0);
            const ownerData = yield* snapshotData(data);

            const prepare: PrepareOAuthCommit<OAuthRegistrationDecision, Result> = (
              rawDecision,
              journal,
            ) => {
              const decision = snapshotOAuthSync(OAuthRegistrationDecision, rawDecision);

              if (decision._tag === "Registered" && !decision.replayed) journal.stage(event);

              const accepted =
                decision._tag === "Registered" || decision._tag === "ProvisioningPending";

              return journal.prepare({
                value:
                  decision._tag === "Registered"
                    ? { _tag: "RegistrationAccepted" as const }
                    : decision._tag === "ProvisioningPending"
                      ? { _tag: "ProvisioningPending" as const, reference: decision.reference }
                      : { _tag: decision._tag },
                credentialCommands:
                  accepted && !decision.replayed
                    ? [
                        { _tag: "Clear" as const, slot: "registration" as const },
                        { _tag: "Clear" as const, slot: "request-binding" as const },
                      ]
                    : [],
              });
            };

            let attempted = false;

            const commit = Effect.gen(function* () {
              if (attempted) return yield* OAuthUnavailable.make({});
              attempted = true;
              const { register } = yield* RegistrationAuthority;

              return yield* register(
                {
                  access: snapshotOAuthSync(OAuthRegistrationAccess, access),
                  intent: snapshotOAuthSync(OAuthRegistrationIntent, intent),
                  commandId: input.commandId,
                  registration: ownerData,
                  fingerprint: checked.fingerprint,
                },
                prepare,
              );
            }).pipe(unexpected);

            return Object.freeze({ commit });
          },
          Effect.provideService(Crypto.Crypto, crypto),
          unexpected,
        ),
        cleanup: Effect.fn("OAuthRegistration.cleanup")(function* (limit) {
          yield* noAmbient();

          const input = yield* Schema.decodeEffect(OAuthCleanupInput)({
            moduleId: id,
            limit,
            nowMillis: DateTime.toEpochMillis(yield* DateTime.now),
          }).pipe(Effect.mapError(() => OAuthRejected.make({})));

          const receipt = yield* cleanup(input, (value, journal) =>
            journal.prepare(
              snapshotOAuthSync(
                Schema.Struct({ removed: Schema.Natural, hasMore: Schema.Boolean }),
                value,
              ),
            ),
          );

          return yield* receipt.read.pipe(Effect.mapError(() => OAuthUnavailable.make({})));
        }, unexpected),
      });
    }),
  );

  const Complete = makeOperation(`${moduleId}/registration/complete`, {
    payload: CompleteInput,
    success: OAuthRegistrationResult,
    error: Failure,
    access: "any",
    exposure: "public",
    replay: "single-use",
    credentials: true,
  });

  const handlersLayer = Complete.credentialHandlerLayer(
    Effect.fn("OAuthRegistration.Complete")(function* (input) {
      const plan = yield* (yield* Registrations).planComplete(input);
      const receipt = yield* plan.commit;
      const result = yield* receipt.read.pipe(Effect.mapError(() => OAuthUnavailable.make({})));

      if (result.value._tag === "Rejected") return yield* OAuthRejected.make({});
      if (result.value._tag === "Conflict") return yield* IdentityConflict.make({});

      return { value: result.value, credentialCommands: result.credentialCommands };
    }),
  );

  return Object.freeze({
    RegistrationCodec,
    CompleteInput,
    RegistrationAuthority,
    Registrations,
    layer,
    operations: Object.freeze({ Complete }),
    handlersLayer,
    group: operationGroup(Complete),
  });
};
