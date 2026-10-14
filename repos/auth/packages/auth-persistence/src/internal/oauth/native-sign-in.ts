import { CurrentCommitJournal, type LifecycleHooks } from "@yielded/auth/Hooks";
import * as M from "@yielded/auth/OAuth";
import { Crypto, Effect } from "effect";
import type { SqlClient } from "effect/sql/SqlClient";

import type { NativeSqlTables } from "../native-sql-table";
import { makeSqlCommitExecutor, registerSqlCommitReceipt, SqlBatchCommit } from "../sql-commit";
import { makeOAuthNativeFlow } from "./native-flow";
import { makeOAuthNativeState, type OAuthNativeReadMapping } from "./native-state";
import { invalidState, unavailable } from "./state";

export const prepareOAuthNative = <Value, A>(
  value: Value,
  prepare: M.PrepareOAuthCommit<Value, A>,
) =>
  Effect.gen(function* () {
    const journal = yield* CurrentCommitJournal;

    const receipt = prepare(value, journal);

    if (!(receipt?._tag === "PreparedCommit" && Effect.isEffect(receipt.read)))
      return yield* invalidState();
    yield* registerSqlCommitReceipt(receipt);

    return receipt;
  });

/** Both physical adapters bind the same native SQL operations. */
export const makeNativeOAuthSignInServices = Effect.fnUntraced(function* (
  tables: NativeSqlTables,
  mapping: OAuthNativeReadMapping,
  batch?: SqlBatchCommit["Service"],
): Effect.fn.Return<
  { readonly oauthSignInPersistence: M.OAuthSignInPersistence["Service"] },
  M.OAuthUnavailable,
  SqlClient | LifecycleHooks | Crypto.Crypto
> {
  const executor = yield* makeSqlCommitExecutor(unavailable);
  const crypto = yield* Crypto.Crypto;
  const state = yield* makeOAuthNativeState(tables, mapping);

  const flow = yield* makeOAuthNativeFlow(
    tables,
    mapping,
    M.OAuthSignInFlow,
    "sign-in",
    () => undefined,
    batch !== undefined,
  );

  const mode = flow.mysql ? "transaction" : "statement";

  const run = <A, E, R>(
    effect: Effect.Effect<A, E, R>,
    selected: "transaction" | "statement" = mode,
  ) =>
    batch === undefined
      ? executor.run(effect, selected)
      : executor.batch(effect).pipe(Effect.provideService(SqlBatchCommit, batch));

  const service: M.OAuthSignInPersistence["Service"] = {
    issue: (original, prepare) =>
      run(
        Effect.gen(function* () {
          const input = M.snapshotOAuthSync(M.OAuthSignInFlow, original);
          const issued = yield* flow.issue(input);

          return yield* prepareOAuthNative(
            issued ? { _tag: "Issued", flow: input } : { _tag: "Rejected" },
            prepare,
          );
        }),
        mode,
      ),
    consume: (original, prepare) =>
      run(
        Effect.gen(function* () {
          const input = M.snapshotOAuthSync(M.OAuthSignInAccess, original);
          const consumed = yield* flow.consume(input);

          return yield* prepareOAuthNative(
            consumed === undefined ? { _tag: "Rejected" } : { _tag: "Consumed", flow: consumed },
            prepare,
          );
        }),
        mode,
      ),
    resolve: (input) =>
      executor.read(
        Effect.suspend(() =>
          state.resolve(
            input.moduleId,
            M.snapshotOAuthSync(M.OAuthExternalIdentity, input.identity),
          ),
        ).pipe(Effect.provideService(Crypto.Crypto, crypto)),
      ),
    cleanup: (original, prepare) =>
      run(
        Effect.gen(function* () {
          const input = M.snapshotOAuthSync(M.OAuthCleanupInput, original);

          return yield* prepareOAuthNative(
            yield* flow.cleanup(input.moduleId, input.limit),
            prepare,
          );
        }),
        "statement",
      ),
  };

  return { oauthSignInPersistence: service };
});
