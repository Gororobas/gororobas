import type { NativeDatabase } from "@yielded/auth-persistence/Adapter";
import { LifecycleHooks } from "@yielded/auth/Hooks";
import {
  OAuthAccountRevision,
  OAuthLinkClaimDecision,
  OAuthLinkDecision,
  OAuthLinkIssueDecision,
  OAuthLinkPendingFlow,
  OAuthUnlinkDecision,
  OAuthUnlinkInspection,
  OAuthAccountsPersistence,
  OAuthRegistrationIntents,
  OAuthSignInPersistence,
  type PrepareOAuthCommit,
  OAuthRegistrationIntent,
  OAuthRegistrationFingerprint,
  OAuthClaim,
  OAuthClaimDecision,
  OAuthCleanupInput,
  OAuthIssueDecision,
  OAuthPendingFlow,
  OAuthSettlementDecision,
  OAuthVerifiedExternalIdentity,
  OAuthCredentialSnapshot,
  snapshotOAuthSync,
  type OAuthUnavailable,
} from "@yielded/auth/OAuth";
import type { SecurityRevision } from "@yielded/auth/Sessions";
/* oxlint-disable no-explicit-any -- concrete driver entry points restore table/database generics. */
import { eq, sql } from "drizzle-orm";
import { type Context, Effect, Layer } from "effect";
import type { Statement } from "effect/sql/Statement";

import type { PersistenceMappingError } from "./model";
import {
  accountCurrent,
  claimLink,
  inspectUnlink,
  issueLink,
  preflightLink,
  settleLink,
  unlink,
} from "./oauth-accounts";
import {
  claimFlow,
  cleanupFlows,
  discoverOwned,
  exactClaim,
  issueFlow,
  matchesAccess,
  readFlow,
  resolveOwned,
  terminalFlow,
} from "./oauth-flow";
import {
  accountsInputs,
  capturedOAuthService,
  registrationInputs,
  registrationIntentInputs,
  signInInputs,
} from "./oauth-input";
import type { OAuthRegistrationAuthority } from "./oauth-model";
import { both, col, equal, CurrentOAuthTransaction, type OAuthNativeDatabase } from "./oauth-owner";
import {
  inspectIntent,
  register,
  registrationData,
  registrationResources,
  type RegistrationCallbacks,
  settleRegistrationIntent,
} from "./oauth-registration";
import { captureOAuthMapping, invariant, nonce, unavailable } from "./oauth-state";
import { validateDrizzleStorage } from "./storage-validation";
import {
  coordinateTransactionOwner,
  makeTransactionExecution,
  sqlClientTransactionStandaloneGuard,
  type TransactionTargetConfiguration,
  type TransactionCoordinatorError,
  type TransactionExecution,
} from "./transaction-execution";

export type OAuthTargetConfiguration = TransactionTargetConfiguration<OAuthUnavailable>;
export type OAuthCoordinatorError<E> = TransactionCoordinatorError<E, OAuthUnavailable>;
export type OAuthExecution = TransactionExecution<OAuthUnavailable, CurrentOAuthTransaction, never>;

export const sqlClientOAuthStandaloneGuard = (
  service: Parameters<typeof sqlClientTransactionStandaloneGuard>[1],
) => sqlClientTransactionStandaloneGuard(unavailable, service);

export const makeOAuthExecution = Effect.fnUntraced(function* (
  configuration: OAuthTargetConfiguration,
  mapping: unknown,
): Effect.fn.Return<OAuthExecution, OAuthUnavailable, LifecycleHooks | NativeDatabase> {
  const hooks = yield* LifecycleHooks;

  yield* validateDrizzleStorage(mapping).pipe(Effect.mapError(unavailable));

  const execution = yield* makeTransactionExecution(
    CurrentOAuthTransaction,
    configuration,
    unavailable,
    nonce,
  );

  return {
    ...execution,
    run: (operation, mutation) =>
      execution.run(operation, mutation).pipe(Effect.provideService(LifecycleHooks, hooks)),
  };
});

const prepareValue = <Value, A>(value: Value, prepare: PrepareOAuthCommit<Value, A>) =>
  Effect.flatMap(CurrentOAuthTransaction, (owner) =>
    Effect.sync(() => {
      owner.guards.push(owner.journal.prepare(undefined));

      return prepare(value, owner.journal);
    }),
  );

export const makeOAuthSignIn = (
  mapping: any,
  execute: OAuthExecution,
): OAuthSignInPersistence["Service"] =>
  capturedOAuthService<OAuthSignInPersistence["Service"]>(
    {
      issue: (original, prepare) =>
        execute.run(
          Effect.gen(function* () {
            const input = snapshotOAuthSync(OAuthPendingFlow, original);
            const value = yield* issueFlow(mapping, input, "sign-in");

            return yield* prepareValue(
              snapshotOAuthSync(OAuthIssueDecision, value as never),
              prepare,
            );
          }),
        ),
      claim: (input, prepare) =>
        execute.run(
          Effect.gen(function* () {
            const read = yield* readFlow(mapping, input, "sign-in");

            const claim =
              read.row !== undefined && read.flow !== undefined && matchesAccess(read.flow, input)
                ? yield* claimFlow(mapping, { row: read.row, flow: read.flow }, input.claimId)
                : undefined;

            return yield* prepareValue(
              snapshotOAuthSync(
                OAuthClaimDecision,
                claim === undefined
                  ? { _tag: "Rejected" }
                  : { _tag: "Claimed", claim: claim as typeof OAuthClaim.Type },
              ),
              prepare,
            );
          }),
        ),
      settle: (original, prepare) =>
        execute.run(
          Effect.gen(function* () {
            const claim = snapshotOAuthSync(OAuthClaim, original.claim);
            const outcome = original.outcome;

            const identity =
              outcome._tag === "Verified"
                ? snapshotOAuthSync(OAuthVerifiedExternalIdentity, outcome.identity).identity
                : undefined;

            if (identity !== undefined)
              invariant(
                identity.provider === claim.flow.context.provider &&
                  identity.issuer === claim.flow.context.issuer,
              );

            // Discover/lock the existing subject before locking its claimed flow.
            const found =
              identity === undefined ? undefined : yield* discoverOwned(mapping, identity);

            const exact = yield* exactClaim(mapping, claim, "sign-in");
            let value: typeof OAuthSettlementDecision.Type = { _tag: "Rejected" };

            if (exact !== undefined) {
              const credential =
                identity === undefined
                  ? undefined
                  : resolveOwned(mapping, claim.flow.context.moduleId, identity, found);

              value =
                outcome._tag !== "Verified"
                  ? { _tag: outcome._tag }
                  : credential === undefined
                    ? { _tag: "Rejected" }
                    : { _tag: "Verified", credential };
              yield* terminalFlow(mapping, claim.flow, value._tag);
            }

            return yield* prepareValue(snapshotOAuthSync(OAuthSettlementDecision, value), prepare);
          }),
        ),
      cleanup: (input, prepare) =>
        execute.run(
          Effect.gen(function* () {
            const value = yield* cleanupFlows(mapping, input, "sign-in");

            return yield* prepareValue(value, prepare);
          }),
        ),
    },
    signInInputs,
    execute.active,
    execute.poison,
  );

export const makeOAuthRegistrationIntents = (
  mapping: any,
  execute: OAuthExecution,
): OAuthRegistrationIntents["Service"] =>
  capturedOAuthService<OAuthRegistrationIntents["Service"]>(
    {
      settle: (input, prepare) =>
        execute.run(
          Effect.gen(function* () {
            const value = yield* settleRegistrationIntent(mapping, {
              claim: snapshotOAuthSync(OAuthClaim, input.claim),
              identity: snapshotOAuthSync(OAuthVerifiedExternalIdentity, input.identity),
              ...(input.intent === undefined
                ? {}
                : { intent: snapshotOAuthSync(OAuthRegistrationIntent, input.intent) }),
            });

            return yield* prepareValue(value, prepare);
          }),
        ),
    },
    registrationIntentInputs,
    execute.active,
    execute.poison,
  );

export const makeOAuthRegistration = <Registration>(
  mapping: any,
  execute: OAuthExecution,
  allocated?: Awaited<ReturnType<typeof registrationResources>> extends Effect.Effect<
    infer A,
    any,
    any
  >
    ? A
    : never,
): OAuthRegistrationAuthority<Registration> =>
  capturedOAuthService<OAuthRegistrationAuthority<Registration>>(
    {
      read: (input) =>
        execute.run(
          Effect.map(inspectIntent(mapping, input), (result) => result?.inspection),
          false,
        ),
      inspect: (input) =>
        Effect.gen(function* () {
          yield* execute.admit;
          const intent = snapshotOAuthSync(OAuthRegistrationIntent, input.intent);
          const stored = mapping.application.encode(input.registration);

          invariant(
            typeof stored === "string" && new TextEncoder().encode(stored).length <= 1048576,
          );
          const detached = { intent, registration: mapping.application.decode(stored) };

          const checked = execute.bound
            ? (invariant(mapping.inspectSync !== undefined), mapping.inspectSync(detached))
            : yield* (mapping as RegistrationCallbacks<Registration>).inspect(detached);

          invariant(typeof checked.eligible === "boolean");

          return {
            fingerprint: snapshotOAuthSync(OAuthRegistrationFingerprint, checked.fingerprint),
            eligible: checked.eligible,
          };
        }).pipe(
          (effect) => (execute.bound ? execute.run(effect, false) : effect),
          Effect.onExit((exit) =>
            Effect.sync(() => {
              if (exit._tag === "Failure") execute.poison();
            }),
          ),
          Effect.mapError(unavailable),
          Effect.catchDefect(() => Effect.fail(unavailable())),
        ) as never,
      register: (input, prepare) =>
        Effect.gen(function* () {
          yield* execute.admit;
          const data = yield* registrationData(mapping, input, execute.bound);
          const resources = allocated ?? (yield* registrationResources(mapping));

          return yield* execute.run(
            Effect.gen(function* () {
              const value = yield* register(mapping, input, data, resources);

              return yield* prepareValue(value, prepare);
            }),
          );
        }).pipe(
          Effect.onExit((exit) =>
            Effect.sync(() => {
              if (exit._tag === "Failure") execute.poison();
            }),
          ),
          Effect.mapError(unavailable),
          Effect.catchDefect(() => Effect.fail(unavailable())),
        ) as never,
      cleanup: (original, prepare) =>
        execute.run(
          Effect.gen(function* () {
            const owner = yield* CurrentOAuthTransaction;

            const input = snapshotOAuthSync(OAuthCleanupInput, original),
              i = mapping.intent,
              r = mapping.command;

            const now = yield* owner.now(mapping.clock);

            const candidates = yield* owner.read(
              i.table,
              both(
                eq(col(i.table, i.moduleId), input.moduleId),
                sql`${col(i.table, i.state)} <> 'ProvisioningPending' and ${col(i.table, i.retentionUntil)} < ${mapping.clock.encodeInstant(now)}`,
              ),
              { limit: input.limit, observe: false, takeOnly: true },
            );

            let removed = 0;

            for (const candidate of candidates.rows) {
              const selected = yield* owner.read(
                i.table,
                equal(i.table, {
                  [i.moduleId]: input.moduleId,
                  [i.reference]: candidate[i.reference],
                }),
                { limit: 1 },
              );

              const row = selected.rows[0];

              if (row === undefined || row[i.state] === "ProvisioningPending") continue;
              let horizon = mapping.clock.decodeInstant(row[i.retentionUntil]);

              if (!Number.isSafeInteger(horizon) || horizon >= (yield* owner.now(mapping.clock)))
                continue;
              if (row[i.commandId] !== null) {
                const commands = yield* owner.read(
                  r.table,
                  equal(r.table, {
                    [r.moduleId]: input.moduleId,
                    [r.commandId]: row[i.commandId],
                  }),
                  { limit: 1 },
                );

                const command = commands.rows[0];

                if (command === undefined) continue;
                horizon = Math.max(horizon, mapping.clock.decodeInstant(command[r.retentionUntil]));
                if (!Number.isSafeInteger(horizon) || horizon >= (yield* owner.now(mapping.clock)))
                  continue;
                yield* owner.remove(r.table, {
                  [r.moduleId]: input.moduleId,
                  [r.commandId]: row[i.commandId],
                });
              }
              yield* owner.remove(i.table, {
                [i.moduleId]: input.moduleId,
                [i.reference]: row[i.reference],
              });
              owner.postconditions.push(sql`${mapping.clock.engineNowMillis} > ${horizon}`);
              removed++;
            }

            return yield* prepareValue(
              { removed, hasMore: candidates.rows.length === input.limit },
              prepare,
            );
          }),
        ),
    },
    registrationInputs(mapping.application),
    execute.active,
    execute.poison,
  );

export const makeTargetOAuthSignInServices = (
  mapping: any,
  configuration: OAuthTargetConfiguration,
) => {
  const captured = captureOAuthMapping(mapping);

  return Effect.map(makeOAuthExecution(configuration, captured), (execution) => ({
    oauthSignInPersistence: makeOAuthSignIn(captured, execution),
  }));
};

export const makeTargetOAuthRegistrationIntentServices = (
  mapping: any,
  configuration: OAuthTargetConfiguration,
) => {
  const captured = captureOAuthMapping(mapping);

  return Effect.map(makeOAuthExecution(configuration, captured), (execution) => ({
    oauthRegistrationIntents: makeOAuthRegistrationIntents(captured, execution),
  }));
};

export const makeTargetOAuthRegistrationServices = <Registration>(
  mapping: any,
  configuration: OAuthTargetConfiguration,
) => {
  const captured = captureOAuthMapping(mapping);

  return Effect.map(makeOAuthExecution(configuration, captured), (execution) => ({
    registrationAuthority: makeOAuthRegistration<Registration>(captured, execution),
  }));
};

export const coordinateOAuthOwner = <Services, Transaction, A, E, R>(
  database: OAuthNativeDatabase,
  mapping: any,
  configuration: OAuthTargetConfiguration,
  allocate: (mapping: any) => Effect.Effect<any, PersistenceMappingError>,
  services: (mapping: any, execution: OAuthExecution, resources: any) => Services,
  owner: (
    transaction: Transaction,
    services: Services,
    append: (statement: Statement<any>) => void,
  ) => Effect.Effect<A, E, R>,
): Effect.Effect<A, OAuthCoordinatorError<E>, R | LifecycleHooks | NativeDatabase> => {
  const captured = captureOAuthMapping(mapping);

  return Effect.flatMap(LifecycleHooks, (hooks) =>
    coordinateTransactionOwner(
      database,
      CurrentOAuthTransaction,
      configuration,
      validateDrizzleStorage(captured).pipe(
        Effect.andThen(Effect.suspend(() => allocate(captured))),
      ),
      unavailable,
      nonce,
      (execution, resources) =>
        services(
          captured,
          {
            ...execution,
            run: (operation, mutation) =>
              execution.run(operation, mutation).pipe(Effect.provideService(LifecycleHooks, hooks)),
          },
          resources,
        ),
      owner,
    ).pipe(Effect.provideService(LifecycleHooks, hooks)),
  );
};

const accountResources = (mapping: any) =>
  Effect.gen(function* () {
    return {
      credentialId: snapshotOAuthSync(
        OAuthCredentialSnapshot.fields.credentialId,
        yield* mapping.allocateCredentialId as Effect.Effect<string, PersistenceMappingError>,
      ),
      revision: snapshotOAuthSync(
        OAuthCredentialSnapshot.fields.credentialRevision,
        yield* mapping.allocateRevision as Effect.Effect<SecurityRevision, PersistenceMappingError>,
      ),
    };
  });

export const coordinateTargetOAuthRegistration = <Registration, Transaction, A, E, R>(
  database: any,
  mapping: any,
  configuration: OAuthTargetConfiguration,
  owner: (
    transaction: Transaction,
    services: { readonly registrationAuthority: OAuthRegistrationAuthority<Registration> },
    append: (statement: Statement<any>) => void,
  ) => Effect.Effect<A, E, R>,
) =>
  coordinateOAuthOwner(
    database,
    mapping,
    configuration,
    registrationResources,
    (captured, execute, resources) => ({
      registrationAuthority: makeOAuthRegistration<Registration>(captured, execute, resources),
    }),
    owner,
  );

export const coordinateTargetOAuthSignIn = <Transaction, A, E, R>(
  database: any,
  mapping: any,
  configuration: OAuthTargetConfiguration,
  owner: (
    transaction: Transaction,
    services: { readonly oauthSignInPersistence: OAuthSignInPersistence["Service"] },
    append: (statement: Statement<any>) => void,
  ) => Effect.Effect<A, E, R>,
) =>
  coordinateOAuthOwner(
    database,
    mapping,
    configuration,
    () => Effect.void,
    (captured, execute) => ({ oauthSignInPersistence: makeOAuthSignIn(captured, execute) }),
    owner,
  );

export const coordinateTargetOAuthRegistrationIntents = <Transaction, A, E, R>(
  database: any,
  mapping: any,
  configuration: OAuthTargetConfiguration,
  owner: (
    transaction: Transaction,
    services: { readonly oauthRegistrationIntents: OAuthRegistrationIntents["Service"] },
    append: (statement: Statement<any>) => void,
  ) => Effect.Effect<A, E, R>,
) =>
  coordinateOAuthOwner(
    database,
    mapping,
    configuration,
    () => Effect.void,
    (captured, execute) => ({
      oauthRegistrationIntents: makeOAuthRegistrationIntents(captured, execute),
    }),
    owner,
  );

export const coordinateTargetOAuthAccounts = <Transaction, A, E, R>(
  database: any,
  mapping: any,
  configuration: OAuthTargetConfiguration,
  owner: (
    transaction: Transaction,
    services: { readonly oauthAccountsPersistence: OAuthAccountsPersistence["Service"] },
    append: (statement: Statement<any>) => void,
  ) => Effect.Effect<A, E, R>,
) =>
  coordinateOAuthOwner(
    database,
    mapping,
    configuration,
    accountResources,
    (captured, execute, resources) => ({
      oauthAccountsPersistence: makeOAuthAccounts(captured, execute, resources),
    }),
    owner,
  );

export const makeOAuthAccounts = (
  mapping: any,
  execute: OAuthExecution,
  resources?: any,
): OAuthAccountsPersistence["Service"] =>
  capturedOAuthService<OAuthAccountsPersistence["Service"]>(
    {
      capture: (input) =>
        execute.run(
          Effect.map(accountCurrent(mapping, input.subjectId), (current) =>
            current === undefined
              ? undefined
              : snapshotOAuthSync(OAuthAccountRevision, current.revision),
          ),
          false,
        ),
      issue: (input, prepare) =>
        execute.run(
          Effect.gen(function* () {
            const value = yield* issueLink(mapping, input);

            return yield* prepareValue(
              snapshotOAuthSync(OAuthLinkIssueDecision, value as never),
              prepare,
            );
          }),
        ),
      preflight: (input) =>
        execute.run(
          Effect.map(preflightLink(mapping, input), (current) =>
            current === undefined
              ? undefined
              : snapshotOAuthSync(OAuthLinkPendingFlow, current.flow),
          ),
          false,
        ),
      claim: (input, prepare) =>
        execute.run(
          Effect.gen(function* () {
            const value = yield* claimLink(mapping, input);

            return yield* prepareValue(
              snapshotOAuthSync(OAuthLinkClaimDecision, value as never),
              prepare,
            );
          }),
        ),
      settle: (input, prepare) =>
        Effect.gen(function* () {
          yield* execute.admit;
          const allocated = resources ?? (yield* accountResources(mapping));

          return yield* execute.run(
            Effect.gen(function* () {
              const value = yield* settleLink(mapping, input, allocated as never);

              return yield* prepareValue(snapshotOAuthSync(OAuthLinkDecision, value), prepare);
            }),
          );
        }).pipe(
          Effect.mapError(unavailable),
          Effect.catchDefect(() => Effect.fail(unavailable())),
        ) as never,
      inspectUnlink: (input) =>
        execute.run(
          Effect.map(inspectUnlink(mapping, input), (value) =>
            snapshotOAuthSync(OAuthUnlinkInspection, value),
          ),
          false,
        ),
      unlink: (input, prepare) =>
        execute.run(
          Effect.gen(function* () {
            const value = yield* unlink(mapping, input);

            return yield* prepareValue(snapshotOAuthSync(OAuthUnlinkDecision, value), prepare);
          }),
        ),
      cleanup: (input, prepare) =>
        execute.run(
          Effect.gen(function* () {
            const owner = yield* CurrentOAuthTransaction;
            const value = yield* cleanupFlows(mapping, input, "link");
            const remaining = input.limit - value.terminalized - value.removed;

            const now = yield* owner.now(mapping.clock),
              r = mapping.command;

            let removed = 0;

            if (remaining > 0) {
              const rows = yield* owner.read(
                r.table,
                both(
                  eq(col(r.table, r.moduleId), input.moduleId),
                  sql`${col(r.table, r.retentionUntil)} < ${mapping.clock.encodeInstant(now)}`,
                ),
                { limit: remaining, observe: false, takeOnly: true },
              );

              for (const row of rows.rows) {
                const key = { [r.moduleId]: input.moduleId, [r.commandId]: row[r.commandId] };
                const selected = yield* owner.read(r.table, equal(r.table, key), { limit: 1 });
                const current = selected.rows[0];

                if (current === undefined) continue;
                const horizon = mapping.clock.decodeInstant(current[r.retentionUntil]);

                if (!Number.isSafeInteger(horizon) || horizon >= (yield* owner.now(mapping.clock)))
                  continue;
                yield* owner.remove(r.table, key);
                owner.postconditions.push(sql`${mapping.clock.engineNowMillis} > ${horizon}`);
                removed++;
              }
            }

            return yield* prepareValue(
              {
                ...value,
                removed: value.removed + removed,
                hasMore: value.hasMore || remaining === removed,
              },
              prepare,
            );
          }),
        ),
    },
    accountsInputs,
    execute.active,
    execute.poison,
  );

export const makeTargetOAuthAccountsServices = (
  mapping: any,
  configuration: OAuthTargetConfiguration,
) => {
  const captured = captureOAuthMapping(mapping);

  return Effect.map(makeOAuthExecution(configuration, captured), (execution) => ({
    oauthAccountsPersistence: makeOAuthAccounts(captured, execution),
  }));
};

export const oauthAccountsPersistenceLayer = <E, R>(
  services: Effect.Effect<Effect.Success<ReturnType<typeof makeTargetOAuthAccountsServices>>, E, R>,
) =>
  Layer.effect(
    OAuthAccountsPersistence,
    Effect.map(services, (value) => value.oauthAccountsPersistence),
  );

export const oauthSignInPersistenceLayer = <E, R>(
  services: Effect.Effect<Effect.Success<ReturnType<typeof makeTargetOAuthSignInServices>>, E, R>,
) =>
  Layer.effect(
    OAuthSignInPersistence,
    Effect.map(services, (value) => value.oauthSignInPersistence),
  );

export const oauthRegistrationIntentsLayer = <E, R>(
  services: Effect.Effect<
    Effect.Success<ReturnType<typeof makeTargetOAuthRegistrationIntentServices>>,
    E,
    R
  >,
) =>
  Layer.effect(
    OAuthRegistrationIntents,
    Effect.map(services, (value) => value.oauthRegistrationIntents),
  );

export const oauthRegistrationAuthorityLayer = <Id, Registration, E, R>(
  tag: Context.Key<Id, OAuthRegistrationAuthority<Registration>>,
  services: Effect.Effect<
    { readonly registrationAuthority: OAuthRegistrationAuthority<Registration> },
    E,
    R
  >,
) =>
  Layer.effect(
    tag,
    Effect.map(services, (value) => value.registrationAuthority),
  );
