import { randomId } from "@yielded/auth-crypto";
import { coordinateCommit, hasCommitScope, LifecycleHooks } from "@yielded/auth/Hooks";
import type { LoginIdentifier } from "@yielded/auth/Identity";
import { PasswordUnavailable } from "@yielded/auth/Password";
import { reportPersistenceFailure } from "@yielded/auth/Persistence";
import type { SubjectId } from "@yielded/auth/Schema";
import { SecurityRevision } from "@yielded/auth/Sessions";
import { type Context, Effect, Schema } from "effect";

import { PersistenceConfigurationError } from "./configuration";
import { CurrentPasswordSql } from "./password-kernel";
import type { QueryOperations } from "./query-operations";
import type { PasswordRegistrationAuthority } from "./registration-contract";
import type { makeMappings } from "./storage-mapping";

class IdentifierTaken extends Schema.TaggedError<IdentifierTaken>()("IdentifierTaken", {}) {}

type CreateSubject = (input: {
  readonly identifier: LoginIdentifier;
  readonly registration: unknown;
}) => Effect.Effect<SubjectId, PasswordUnavailable>;

/** Registration reserves the command, provisions the application's subject, and
 * creates the unverified identifier and password in one SQL transaction. Replays
 * always suppress; a public request ID never recovers a private password intent.
 */
export const makeRegistrationAuthority = Effect.fn("makeRegistrationAuthority")(function* <R>(
  mappings: ReturnType<typeof makeMappings>,
  operations: QueryOperations,
  standalone: Effect.Effect<void, PasswordUnavailable>,
  provisioning: Context.Key<R, object>,
  strategy: string,
): Effect.fn.Return<
  PasswordRegistrationAuthority<unknown>,
  PersistenceConfigurationError,
  LifecycleHooks | CurrentPasswordSql | R
> {
  const database = yield* CurrentPasswordSql;
  const hooks = yield* LifecycleHooks;
  // Core has already decoded registration with the selected strategy's Schema;
  // the dynamic strategy table erases only that heterogeneous callback signature.
  const creators = (yield* provisioning) as Readonly<Record<string, CreateSubject>>;
  const createSubject = creators[strategy];

  if (createSubject === undefined)
    return yield* PersistenceConfigurationError.make({
      reason: `Missing subject provisioning for ${strategy}`,
    });
  const { and, eq, column } = operations;
  const mapping = mappings.passwords();
  const receipts = mappings.table("passwordRegistrations");

  return {
    register: (input, prepare) =>
      Effect.gen(function* () {
        if (yield* hasCommitScope) return yield* PasswordUnavailable.make({});
        yield* standalone;

        const receipt = { moduleId: input.moduleId, requestId: input.requestId };

        const suppress = coordinateCommit(
          (journal) =>
            database.transaction((tx) =>
              Effect.gen(function* () {
                yield* tx.insert(receipts).values(receipt).onConflictDoNothing();

                return prepare({ _tag: "Suppressed" }, journal);
              }),
            ),
          { mode: "interactive" },
        );

        const committed = yield* coordinateCommit(
          (journal) =>
            database.transaction((tx) =>
              Effect.gen(function* () {
                const reserved = yield* tx
                  .insert(receipts)
                  .values(receipt)
                  .onConflictDoNothing()
                  .returning();

                if (reserved.length === 0) return prepare({ _tag: "Suppressed" }, journal);

                const identifiers = yield* tx
                  .select()
                  .from(mapping.identifier.table)
                  .where(
                    and(
                      eq(
                        column(mapping.identifier.table, mapping.identifier.namespace),
                        input.identifier.namespace,
                      ),
                      eq(
                        column(mapping.identifier.table, mapping.identifier.value),
                        input.identifier.value,
                      ),
                    ),
                  )
                  .limit(1);

                if (identifiers.length !== 0) return prepare({ _tag: "Suppressed" }, journal);

                const subjectId = yield* createSubject({
                  identifier: input.identifier,
                  registration: input.registration,
                });

                const nativeId = yield* mapping.subjectId.toNative(subjectId);

                const subjects = yield* tx
                  .select()
                  .from(mapping.subject.table)
                  .where(eq(column(mapping.subject.table, mapping.subject.id), nativeId))
                  .limit(1);

                if (
                  subjects.length !== 1 ||
                  !mapping.subject.isActiveStatus(subjects[0][mapping.subject.status])
                )
                  return yield* PasswordUnavailable.make({});
                yield* Schema.decodeUnknownEffect(SecurityRevision)(
                  subjects[0][mapping.subject.securityRevision],
                );

                const bound = yield* tx
                  .insert(mapping.identifier.table)
                  .values(
                    mapping.identifier.encodeInitialInsert(
                      input.identifier,
                      nativeId,
                      SecurityRevision.make(randomId()),
                    ),
                  )
                  .onConflictDoNothing()
                  .returning();

                // A concurrent registration won the identifier. Roll back the application
                // subject too, then persist a non-authorizing receipt in a new transaction.
                if (bound.length !== 1) return yield* new IdentifierTaken({});

                const credentialId = randomId();
                const credentialRevision = SecurityRevision.make(randomId());

                yield* tx.insert(mapping.credential.table).values(
                  mapping.credential.encodeInsert({
                    moduleId: input.moduleId,
                    subjectId: nativeId,
                    credentialId,
                    credentialRevision,
                    verifierVersion: SecurityRevision.make(randomId()),
                    replacement: input.replacement,
                  }),
                );
                yield* tx.insert(mapping.authorityCredential.table).values(
                  mapping.authorityCredential.encodeInsert({
                    subjectId: nativeId,
                    credentialId,
                    revision: credentialRevision,
                  }),
                );

                return prepare({ _tag: "Created", subjectId }, journal);
              }),
            ),
          { mode: "interactive" },
        ).pipe(Effect.catchTag("IdentifierTaken", () => suppress));

        return committed.value;
      }).pipe(
        Effect.provideService(LifecycleHooks, hooks),
        (work) => reportPersistenceFailure(work, Schema.is(PasswordUnavailable)),
        Effect.mapError(() => PasswordUnavailable.make({})),
      ),
  };
});
