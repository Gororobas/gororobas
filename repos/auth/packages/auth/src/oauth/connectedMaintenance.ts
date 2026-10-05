import { Context, DateTime, Effect, Exit, Layer, Option, Schema, Crypto, Cause } from "effect";
import { Base64Url } from "effect/encoding";

import { hasCommitScope } from "../hooks/commit";
import type { AuthInvocation } from "../operations/context";
import { OperationForbidden } from "../operations/errors";
import { makeOperation, operationGroup } from "../operations/operation";
import {
  captureConnectedPolicy,
  connectedBounded,
  connectedRead,
  connectedSafe,
  validateConnectedPolicy,
  wipeConnectedMaterial,
} from "./connectedAccess";
import * as M from "./connectedModels";
import { OAuthConnectedPersistence } from "./OAuthConnectedPersistence";
import { OAuthConnectedProtocol } from "./OAuthConnectedProtocol";
import {
  OAuthConnectedRevocations,
  OAuthConnectedRevocationClaim,
  OAuthConnectedRevocationDecision,
} from "./OAuthConnectedRevocations";
import { OAuthConnectedTokenProtector } from "./OAuthConnectedTokenProtector";
import { OAuthMethodUnsupported, OAuthUnavailable } from "./signInErrors";
import { OAuthClaimId, OAuthCleanupInput } from "./signInModels";
import { snapshotOAuth, snapshotOAuthSync } from "./signInSnapshot";

const Failure = Schema.Union([OperationForbidden, OAuthMethodUnsupported, OAuthUnavailable]);
const RunResult = Schema.Struct({ outcome: Schema.Literals(["Empty", "Confirmed", "Unknown"]) });
const Cleanup = Schema.Struct({ limit: OAuthCleanupInput.fields.limit });

const authorize = Effect.fn("OAuthConnectedMaintenance.authorize")(function* (
  invocation: AuthInvocation,
) {
  if (yield* hasCommitScope) return yield* OAuthMethodUnsupported.make({});
  if (invocation._tag !== "System") return yield* OperationForbidden.make({});
});

export interface MaintenanceModule<Id extends string> {
  readonly moduleId: Id;
  readonly kind: "oauth-connected-maintenance";
}

/** Explicit privileged maintenance. No scheduler, retry loop or expired takeover. */
export const makeOAuthConnectedMaintenance = <const Id extends string>(
  moduleId: Id,
  configuration: M.OAuthConnectedPolicy,
) => {
  const ConnectedMaintenance = Context.Service<
    MaintenanceModule<Id>,
    {
      readonly cleanup: (
        invocation: AuthInvocation,
        limit: number,
      ) => Effect.Effect<typeof M.OAuthConnectedCleanupResult.Type, typeof Failure.Type>;
      readonly runRevocation: (
        invocation: AuthInvocation,
      ) => Effect.Effect<typeof RunResult.Type, typeof Failure.Type>;
    }
  >()("effect-auth/oauth/" + moduleId.length + ":" + moduleId + "/ConnectedMaintenance");

  const captured = captureConnectedPolicy(configuration);

  const maintenanceLayer = Layer.effect(
    ConnectedMaintenance,
    Effect.gen(function* () {
      const { id, policy } = yield* validateConnectedPolicy(moduleId, captured);
      const { cleanup: clean } = yield* OAuthConnectedPersistence;
      const revocations = yield* Effect.serviceOption(OAuthConnectedRevocations);
      const { revokeGrant } = yield* OAuthConnectedProtocol;
      const { open } = yield* OAuthConnectedTokenProtector;
      const { randomBytes } = yield* Crypto.Crypto;

      const cleanup = Effect.fn("OAuthConnectedMaintenance.cleanup")(function* (
        invocation: AuthInvocation,
        limit: number,
      ) {
        yield* authorize(invocation);

        const input = yield* snapshotOAuth(OAuthCleanupInput, {
          moduleId: id,
          limit,
          nowMillis: DateTime.toEpochMillis(yield* DateTime.now),
        });

        const receipt = yield* clean(input, (value, journal) => {
          const result = snapshotOAuthSync(M.OAuthConnectedCleanupResult, value);

          if (result.terminalized + result.removed > input.limit) throw OAuthUnavailable.make({});

          return journal.prepare(result);
        });

        return yield* connectedRead(receipt);
      }, connectedSafe);

      const runRevocation = Effect.fn("OAuthConnectedMaintenance.runRevocation")(function* (
        invocation: AuthInvocation,
      ) {
        yield* authorize(invocation);
        if (Option.isNone(revocations)) return yield* OAuthMethodUnsupported.make({});
        const { claim, settle } = revocations.value;
        const bytes = yield* randomBytes(32).pipe(Effect.mapError(() => OAuthUnavailable.make({})));
        const claimId = OAuthClaimId.make(Base64Url.encode(bytes));

        bytes.fill(0);

        return yield* Effect.uninterruptibleMask((restore) =>
          Effect.gen(function* () {
            const receipt = yield* restore(
              claim(
                { moduleId: id, claimId, lifetimeMillis: policy.refreshClaimLifetimeMillis },
                (value, journal) =>
                  journal.prepare(snapshotOAuthSync(OAuthConnectedRevocationDecision, value)),
              ),
            );

            const decision = yield* connectedRead(receipt);

            if (decision._tag === "Empty") return { outcome: "Empty" as const };
            const owned = snapshotOAuthSync(OAuthConnectedRevocationClaim, decision.claim);

            if (
              owned.claimId !== claimId ||
              owned.job.context.token.moduleId !== id ||
              owned.claimExpiresAtMillis !==
                owned.claimedAtMillis + policy.refreshClaimLifetimeMillis ||
              owned.claimedAtMillis > DateTime.toEpochMillis(yield* DateTime.now)
            )
              return yield* OAuthUnavailable.make({});

            const call = Effect.gen(function* () {
              const context = owned.job.context.token;

              if (
                context.configuration.profile.revocation !== "cohort" ||
                DateTime.toEpochMillis(yield* DateTime.now) >= owned.claimExpiresAtMillis
              )
                return yield* OAuthUnavailable.make({});

              const material = yield* open({
                context: owned.job.context,
                sealed: owned.job.sealed,
              }).pipe(
                Effect.flatMap((value) => snapshotOAuth(M.OAuthConnectedTokenMaterial, value)),
              );

              return yield* revokeGrant({
                context: snapshotOAuthSync(M.OAuthConnectedTokenContext, context),
                material: snapshotOAuthSync(M.OAuthConnectedTokenMaterial, material),
              }).pipe(
                Effect.flatMap((value) => Schema.decodeEffect(Schema.Literal("Confirmed"))(value)),
                Effect.ensuring(Effect.sync(() => wipeConnectedMaterial(material))),
              );
            });

            const result = yield* Effect.exit(
              restore(
                connectedBounded(
                  call,
                  Math.max(
                    1,
                    owned.claimExpiresAtMillis - DateTime.toEpochMillis(yield* DateTime.now),
                  ),
                ),
              ),
            );

            const outcome =
              Exit.isSuccess(result) &&
              DateTime.toEpochMillis(yield* DateTime.now) < owned.claimExpiresAtMillis
                ? ("Confirmed" as const)
                : ("Unknown" as const);

            const final = yield* connectedBounded(
              settle({ claim: owned, outcome }, (value, journal) =>
                journal.prepare(
                  snapshotOAuthSync(Schema.Struct({ settled: Schema.Boolean }), value),
                ),
              ),
              policy.settlementTimeoutMillis,
            ).pipe(
              Effect.flatMap(connectedRead),
              Effect.mapError(() => OAuthUnavailable.make({})),
            );

            if (Exit.isFailure(result)) {
              if (Cause.hasInterrupts(result.cause)) return yield* Effect.interrupt;
              if (Cause.hasDies(result.cause))
                return yield* Effect.failCause(
                  Cause.fromReasons<never>(result.cause.reasons.filter(Cause.isDieReason)),
                );
            }

            return { outcome: final.settled ? outcome : ("Unknown" as const) };
          }),
        );
      }, connectedSafe);

      return ConnectedMaintenance.of({ cleanup, runRevocation });
    }),
  );

  const CleanupOperation = makeOperation(`${moduleId}/connected/maintenance/cleanup`, {
    payload: Cleanup,
    success: M.OAuthConnectedCleanupResult,
    error: Failure,
    access: "system",
    exposure: "internal",
    replay: "idempotent",
  });

  const RunRevocation = makeOperation(`${moduleId}/connected/maintenance/revocation`, {
    payload: Schema.Struct({}),
    success: RunResult,
    error: Failure,
    access: "system",
    exposure: "internal",
    replay: "non-idempotent",
  });

  const maintenanceHandlersLayer = Layer.mergeAll(
    CleanupOperation.handlerLayer(
      Effect.fn("OAuthConnected.Cleanup")(function* (input, invocation) {
        return yield* (yield* ConnectedMaintenance).cleanup(invocation, input.limit);
      }),
    ),
    RunRevocation.handlerLayer(
      Effect.fn("OAuthConnected.RunRevocation")(function* (_input, invocation) {
        return yield* (yield* ConnectedMaintenance).runRevocation(invocation);
      }),
    ),
  );

  return {
    ConnectedMaintenance,
    maintenanceLayer,
    maintenanceHandlersLayer,
    maintenanceOperations: Object.freeze({ Cleanup: CleanupOperation, RunRevocation }),
    maintenanceGroup: operationGroup(CleanupOperation, RunRevocation),
  };
};
