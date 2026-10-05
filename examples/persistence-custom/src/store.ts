import { Hooks } from "@yielded/auth";
import {
  Config,
  Context,
  DateTime,
  Effect,
  FileSystem,
  Layer,
  Path,
  Schema,
  Semaphore,
} from "effect";

import { Database, emptyDatabase, type State } from "./model";

export class StoreUnavailable extends Schema.TaggedError<StoreUnavailable>()(
  "StoreUnavailable",
  {},
) {}

export class StoreLocked extends Schema.TaggedError<StoreLocked>()("StoreLocked", {
  message: Schema.String,
}) {}

export interface StoreJournal extends Hooks.CommitJournal {
  /** Repeat time predicates after writing the snapshot, immediately before rename. */
  readonly beforeCommit: (check: (now: number) => boolean) => void;
}

export class DataDirectory extends Context.Service<DataDirectory, string>()(
  "customers/DataDirectory",
) {
  static readonly layer = Layer.effect(
    DataDirectory,
    Effect.gen(function* () {
      const directory = yield* Config.String("AUTH_DATA_DIR").pipe(
        Config.withDefault(new URL("../.data/", import.meta.url).pathname),
      );

      const fs = yield* FileSystem.FileSystem;

      yield* fs.makeDirectory(directory, { recursive: true, mode: 0o700 });

      return directory;
    }),
  );
}

export class AccountStore extends Context.Service<
  AccountStore,
  {
    readonly read: <A, E>(
      body: (state: Readonly<State>, now: number) => Effect.Effect<A, E>,
    ) => Effect.Effect<A, E | StoreUnavailable>;
    readonly transaction: <A, E>(
      body: (state: State, journal: StoreJournal, now: number) => Effect.Effect<A, E>,
    ) => Effect.Effect<A, E | StoreUnavailable>;
  }
>()("customers/AccountStore") {
  /** One local writer; exclusive lock, schema snapshots, fsync, then atomic rename. */
  static readonly layer = Layer.effect(
    AccountStore,
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const directory = yield* DataDirectory;
      const hooks = yield* Hooks.LifecycleHooks;
      const mutex = yield* Semaphore.make(1);
      const filename = path.join(directory, "accounts.json");
      const lock = path.join(directory, "writer.lock");
      const temporary = path.join(directory, "accounts.pending.json");
      const codec = Schema.fromJsonString(Database);

      yield* Effect.acquireRelease(
        fs
          .writeFileString(lock, "Exclusive account-store writer\n", { flag: "wx", mode: 0o600 })
          .pipe(
            Effect.mapError((error) =>
              error.reason._tag === "AlreadyExists"
                ? StoreLocked.make({
                    message: `Another writer owns ${lock}. After a crash, remove this file only after confirming that the old process has stopped.`,
                  })
                : StoreUnavailable.make({}),
            ),
          ),
        () => fs.remove(lock).pipe(Effect.orDie),
      );

      let state: State = (yield* fs.exists(filename))
        ? yield* fs.readFileString(filename).pipe(
            Effect.flatMap(Schema.decodeEffect(codec)),
            Effect.mapError(() => StoreUnavailable.make({})),
          )
        : emptyDatabase();

      let available = true;

      yield* fs.remove(temporary, { force: true });
      yield* Effect.addFinalizer(() =>
        Effect.sync(() => {
          available = false;
          state = emptyDatabase();
        }),
      );

      const publish = Effect.fn("AccountStore.publish")(function* (
        next: State,
        checks: ReadonlyArray<(now: number) => boolean>,
      ) {
        const encoded = yield* Schema.encodeEffect(codec)(next).pipe(
          Effect.mapError(() => StoreUnavailable.make({})),
        );

        // Nothing can cancel between the durable rename and publishing the memory snapshot.
        yield* Effect.uninterruptible(
          Effect.scoped(
            Effect.gen(function* () {
              const file = yield* fs.open(temporary, { flag: "w", mode: 0o600 });

              yield* file.writeAll(new TextEncoder().encode(encoded));
              yield* file.sync;
              const parent = yield* fs.open(directory, { flag: "r" });
              const now = DateTime.toEpochMillis(yield* DateTime.now);

              if (!checks.every((check) => check(now))) return yield* StoreUnavailable.make({});
              yield* fs.rename(temporary, filename).pipe(
                Effect.andThen(parent.sync),
                // An uncertain rename/fsync outcome requires a reload, never an automatic retry.
                Effect.onError(() =>
                  Effect.sync(() => {
                    available = false;
                  }),
                ),
              );
              state = next;
            }),
          ).pipe(Effect.mapError(() => StoreUnavailable.make({}))),
        );
      });

      return AccountStore.of({
        read: (body) =>
          mutex.withPermits(1)(
            Effect.gen(function* () {
              if (!available) return yield* StoreUnavailable.make({});

              return yield* body(state, DateTime.toEpochMillis(yield* DateTime.now));
            }),
          ),
        transaction: (body) =>
          Effect.gen(function* () {
            if (yield* Hooks.hasCommitScope) return yield* StoreUnavailable.make({});

            const result = yield* Hooks.coordinateCommit(
              (journal) =>
                mutex.withPermits(1)(
                  Effect.gen(function* () {
                    if (!available) return yield* StoreUnavailable.make({});

                    const next = yield* Schema.encodeEffect(codec)(state).pipe(
                      Effect.flatMap(Schema.decodeEffect(codec)),
                      Effect.mapError(() => StoreUnavailable.make({})),
                    );

                    const working: State = next;
                    const now = DateTime.toEpochMillis(yield* DateTime.now);

                    working.charges = working.charges.filter(
                      (event) => event.retentionUntil >= now,
                    );
                    const checks: Array<(now: number) => boolean> = [];

                    const value = yield* body(
                      working,
                      {
                        ...journal,
                        beforeCommit: (check) => {
                          checks.push(check);
                        },
                      },
                      now,
                    );

                    yield* publish(working, checks);

                    return value;
                  }),
                ),
              { mode: "interactive" },
            ).pipe(Effect.catchTag("HookConfigurationError", () => StoreUnavailable.make({})));

            return result.value;
          }).pipe(Effect.provideService(Hooks.LifecycleHooks, hooks)),
      });
    }),
  ).pipe(Layer.provide(DataDirectory.layer));
}
