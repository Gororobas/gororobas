import { Cause, Context, Effect, Option, Schema } from "effect";

import { LifecycleHooks } from "./LifecycleHooks";
import {
  HookConfigurationError,
  type HookDelivery,
  type LifecycleEvent,
  type LifecycleEventId,
  lifecycleEvent,
} from "./models";
import { type AtomicContribution, type CommitMode, validateContributions } from "./transactions";

export class CommitPending extends Schema.TaggedError<CommitPending>()("CommitPending", {}) {}
export class CommitDiscarded extends Schema.TaggedError<CommitDiscarded>()("CommitDiscarded", {}) {}

/** No value is exposed until the outermost transaction authority has committed. */
export interface PreparedCommit<A> {
  readonly _tag: "PreparedCommit";
  readonly read: Effect.Effect<A, CommitPending | CommitDiscarded>;
}

interface CommitParticipant {
  readonly commit: () => void;
  readonly discard: () => void;
}

export interface CommitJournal {
  readonly prepare: <A>(value: A) => PreparedCommit<A>;
  /** Stage only work belonging to this transaction/savepoint, before its commit returns. */
  readonly stage: (event: LifecycleEvent) => void;
  /** Call only after staging this event's outbox write in the same transaction/batch. */
  readonly defer: (event: LifecycleEvent) => void;
}

/** Current journal for internal transaction operations. Public commit-owner
 * continuations still receive the journal explicitly at the native boundary. */
export class CurrentCommitJournal extends Context.Service<CurrentCommitJournal, CommitJournal>()(
  "effect-auth/hooks/CurrentCommitJournal",
) {}

interface StagedEvent {
  readonly event: LifecycleEvent;
  readonly deferred: boolean;
}

class CurrentCommit extends Context.Service<
  CurrentCommit,
  {
    readonly reservations: Set<string>;
    readonly assertOpen: () => void;
    readonly promote: (
      events: ReadonlyArray<StagedEvent>,
      participants: ReadonlyArray<CommitParticipant>,
      reservations: ReadonlySet<string>,
    ) => void;
  }
>()("effect-auth/hooks/CurrentCommit") {}

/** Public operations may reject unsupported ambient execution before any mutation. */
export const hasCommitScope = Effect.serviceOption(CurrentCommit).pipe(Effect.map(Option.isSome));

export type CommitResult<A> =
  | { readonly _tag: "PendingCommit"; readonly value: A }
  | {
      readonly _tag: "Committed";
      readonly value: A;
      readonly delivery: ReadonlyArray<HookDelivery>;
      readonly deferred: ReadonlyArray<LifecycleEventId>;
    };

/**
 * `owner` must resolve only after its real transaction or batch commits. Nested
 * calls inherit the outer journal; their events are discarded on failure and
 * cannot dispatch until the outermost owner succeeds. Wrap a caught savepoint
 * rollback in its own coordinateCommit call so its events are discarded too.
 * Direct delivery is best effort: a process crash loses staged memory and no
 * retry is automatic. Once the owner returns, interruption is masked during
 * dispatch; that makes reporting coherent, not durable. An outbox owner stages
 * its writes before calling journal.defer and owns worker retries/deduplication.
 */
export const coordinateCommit = <A, E, R>(
  owner: (journal: CommitJournal) => Effect.Effect<A, E, R>,
  options: {
    readonly mode: CommitMode;
    readonly contributions?: ReadonlyArray<AtomicContribution>;
  },
): Effect.Effect<
  CommitResult<A>,
  E | HookConfigurationError,
  Exclude<R, CurrentCommitJournal> | LifecycleHooks
> =>
  Effect.uninterruptibleMask((restore) =>
    Effect.gen(function* () {
      yield* Effect.try({
        try: () => validateContributions(options.mode, options.contributions ?? []),
        catch: (error) =>
          Schema.is(HookConfigurationError)(error)
            ? error
            : HookConfigurationError.make({
                reason: "incompatible-transaction",
                contribution: "transaction",
              }),
      });
      const parent = yield* Effect.serviceOption(CurrentCommit);
      const hooks = yield* LifecycleHooks;
      const events: StagedEvent[] = [];
      const participants: CommitParticipant[] = [];
      const reservations = Option.isSome(parent) ? parent.value.reservations : new Set<string>();
      const ownedReservations = new Set<string>();

      const discard = Effect.sync(() => {
        for (const participant of participants) participant.discard();
        for (const id of ownedReservations) reservations.delete(id);
        ownedReservations.clear();
      });

      let open = true;

      const assertOpen = (): void => {
        if (!open)
          throw HookConfigurationError.make({
            reason: "closed-journal",
            contribution: "transaction",
          });
        if (Option.isSome(parent)) parent.value.assertOpen();
      };

      const append = (
        incoming: ReadonlyArray<StagedEvent>,
        incomingParticipants: ReadonlyArray<CommitParticipant> = [],
      ): void => {
        assertOpen();
        const next = new Set(reservations);

        for (const { event } of incoming) {
          if (next.has(event.id))
            throw HookConfigurationError.make({
              reason: "duplicate-event",
              contribution: event.id,
            });
          next.add(event.id);
        }
        // Reserve while the native owner can still roll back. Successful child
        // owners transfer these reservations without another duplicate check.
        for (const item of incoming) {
          reservations.add(item.event.id);
          ownedReservations.add(item.event.id);
          events.push(item);
        }
        participants.push(...incomingParticipants);
      };

      const promote = (
        incoming: ReadonlyArray<StagedEvent>,
        incomingParticipants: ReadonlyArray<CommitParticipant>,
        incomingReservations: ReadonlySet<string>,
      ): void => {
        assertOpen();
        events.push(...incoming);
        participants.push(...incomingParticipants);
        for (const id of incomingReservations) ownedReservations.add(id);
      };

      const journal: CommitJournal = {
        prepare: <A>(input: A): PreparedCommit<A> => {
          let status: "pending" | "committed" | "discarded" = "pending";
          let value: Option.Option<A> = Option.some(input);

          append(
            [],
            [
              {
                commit: () => {
                  status = "committed";
                },
                discard: () => {
                  status = "discarded";
                  value = Option.none();
                },
              },
            ],
          );

          return Object.freeze({
            _tag: "PreparedCommit",
            read: Effect.suspend((): Effect.Effect<A, CommitPending | CommitDiscarded> =>
              status === "committed" && Option.isSome(value)
                ? Effect.succeed(value.value)
                : status === "discarded"
                  ? Effect.fail(CommitDiscarded.make({}))
                  : Effect.fail(CommitPending.make({})),
            ),
          });
        },
        stage: (input) => append([{ event: lifecycleEvent(input), deferred: false }]),
        defer: (input) => append([{ event: lifecycleEvent(input), deferred: true }]),
      };

      const value = yield* restore(Effect.suspend(() => owner(journal))).pipe(
        Effect.provideService(CurrentCommitJournal, journal),
        Effect.provideService(CurrentCommit, { reservations, assertOpen, promote }),
        // Synchronous journal methods can throw inside an Effect callback. The
        // owner's failed transaction has rolled back before we normalize them.
        // Mixed causes stay intact so typed recovery cannot swallow a defect or interruption.
        Effect.catchCause((cause) =>
          Effect.failCause(
            cause.reasons.every(
              (reason) =>
                Cause.isDieReason(reason) && Schema.is(HookConfigurationError)(reason.defect),
            )
              ? Cause.fromReasons<E | HookConfigurationError>(
                  cause.reasons.map((reason) =>
                    Cause.isDieReason(reason) && Schema.is(HookConfigurationError)(reason.defect)
                      ? Cause.makeFailReason(reason.defect).annotate(
                          Cause.reasonAnnotations(reason),
                        )
                      : reason,
                  ),
                )
              : cause,
          ),
        ),
        Effect.onError(() => discard),
        Effect.ensuring(
          Effect.sync(() => {
            open = false;
          }),
        ),
      );

      if (Option.isSome(parent)) {
        yield* Effect.try({
          try: () => parent.value.promote(events, participants, ownedReservations),
          catch: (error) =>
            Schema.is(HookConfigurationError)(error)
              ? error
              : HookConfigurationError.make({
                  reason: "closed-journal",
                  contribution: "transaction",
                }),
        }).pipe(Effect.onError(() => discard));

        return { _tag: "PendingCommit", value } as const;
      }
      for (const participant of participants) participant.commit();
      const delivery: HookDelivery[] = [];
      const deferred: LifecycleEventId[] = [];

      for (const { event, deferred: isDeferred } of events) {
        if (isDeferred) deferred.push(event.id);
        // The commit above is already durable. Post-commit work stays interruptible
        // so a caller deadline can finish without repeating that commit.
        else delivery.push(...(yield* restore(hooks.after(event))));
      }

      return { _tag: "Committed", value, delivery, deferred } as const;
    }),
  );

/**
 * An outbox implementation stages this immutable event in the same authority's
 * transaction/batch. A delivery worker later calls LifecycleHooks.after(event),
 * retaining the same ID on every attempt and deduplicating each contribution.
 * Delivery is at least once when the consumer provides persistence and retries;
 * this interface alone supplies no persistence or exactly-once guarantee.
 */
export interface EventOutbox<E = never, R = never> {
  readonly stage: (event: LifecycleEvent) => Effect.Effect<void, E, R>;
}

export interface BatchEventOutbox<Statement> {
  readonly statements: (event: LifecycleEvent) => ReadonlyArray<Statement>;
}
