import { Hooks, type Identity, Operations, Schema as AuthSchema } from "@yielded/auth";
import type { Redacted } from "effect";
import { Context, DateTime, Effect, Schema } from "effect";

export class ExternalProofRejected extends Schema.TaggedError<ExternalProofRejected>()(
  "ExternalProofRejected",
  {},
) {}

/** The consumer checks the external issuer's proof, expiration, and replay policy. */
export class ExternalProofVerifier extends Context.Service<
  ExternalProofVerifier,
  {
    readonly verify: (
      proof: Redacted.Redacted<string>,
    ) => Effect.Effect<Identity.LoginIdentifier, ExternalProofRejected>;
  }
>()("example/ExternalProofVerifier") {}

export class RegistrationTransaction extends Context.Service<
  RegistrationTransaction,
  {
    readonly register: (identifier: Identity.LoginIdentifier) => AuthSchema.SubjectId;
    readonly recordOnboarding: (subjectId: AuthSchema.SubjectId) => void;
  }
>()("example/RegistrationTransaction") {}

/** This port owns the actual commit; auth and application writes use its same transaction. */
export class RegistrationAuthority extends Context.Service<
  RegistrationAuthority,
  {
    readonly transaction: <A, E, R>(
      work: Effect.Effect<A, E, R>,
    ) => Effect.Effect<A, E, Exclude<R, RegistrationTransaction>>;
  }
>()("example/RegistrationAuthority") {}

export const ExternalRegistration = Operations.makeOperation("example.external.register", {
  payload: Schema.Struct({
    proof: Schema.Redacted(Schema.String),
  }),
  success: Schema.Struct({
    subjectId: AuthSchema.SubjectId,
    commit: Schema.Literals(["Committed", "PendingCommit"]),
  }),
  error: Schema.Union([ExternalProofRejected, Hooks.HookDenied, Hooks.HookConfigurationError]),
  access: "any",
  exposure: "public",
  replay: "non-idempotent",
});

export interface RegistrationContribution<E = never, R = never> {
  readonly id: string;
  readonly mode: "interactive";
  readonly run: (snapshot: Hooks.LifecycleSnapshot) => Effect.Effect<void, E, R>;
}

/** This ordinary Layer is the method implementation. No registry or table declarations are needed. */
export const externalMethodLayer = <R = never>(
  contributions: ReadonlyArray<RegistrationContribution<Hooks.HookDenied, R>> = [],
) =>
  ExternalRegistration.handlerLayer(
    Effect.fn("ExternalRegistration.handle")(function* (input) {
      const verifier = yield* ExternalProofVerifier;
      const authority = yield* RegistrationAuthority;
      const hooks = yield* Hooks.LifecycleHooks;
      const identifier = yield* verifier.verify(input.proof);

      const before = Hooks.lifecycleSnapshot({
        action: "registration",
        operation: ExternalRegistration.rpc._tag,
        method: "external-proof",
        identifiers: [identifier],
      });

      yield* hooks.before(before);
      const occurredAt = yield* DateTime.now;

      const result = yield* Hooks.coordinateCommit(
        (journal) =>
          authority.transaction(
            Effect.gen(function* () {
              const transaction = yield* RegistrationTransaction;
              const subjectId = transaction.register(identifier);
              const snapshot = Hooks.lifecycleSnapshot({ ...before, subjectId });

              for (const contribution of contributions) yield* contribution.run(snapshot);
              journal.stage(
                Hooks.lifecycleEvent({
                  id: Hooks.LifecycleEventId.make(globalThis.crypto.randomUUID()),
                  occurredAtMillis: DateTime.toEpochMillis(occurredAt),
                  snapshot,
                }),
              );

              return subjectId;
            }),
          ),
        { mode: "interactive", contributions },
      );

      return { subjectId: result.value, commit: result._tag };
    }),
  );

/** Metadata is needed only when aggregating operations with other plugins. */
export const externalMethodContributions = Hooks.pluginContributions({
  id: "example/external-method",
  operations: [ExternalRegistration],
  hooks: [],
  routes: [],
});
