import { CurrentCommitJournal, type LifecycleHooks } from "@yielded/auth/Hooks";
import * as M from "@yielded/auth/OAuth";
import * as Digest from "effect/crypto/Digest";
import * as SecureRandom from "effect/crypto/SecureRandom";
import * as Effect from "effect/Effect";
import type * as SqlClient from "effect/sql/SqlClient";

import type { NativeSqlTables } from "../native-sql-table";
import { makeSqlCommitExecutor, registerSqlCommitReceipt, SqlBatchCommit } from "../sql-commit";
import { makeOAuthNativeFlow } from "./native-flow";
import { makeOAuthNativeState, type OAuthNativeReadMapping } from "./native-state";
import { invalidState, unavailable } from "./state";

export const prepareOAuthNative = Effect.fnUntraced(function* <Value, A>(
  value: Value,
  prepare: M.PrepareOAuthCommit<Value, A>,
) {
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
  SqlClient.SqlClient | LifecycleHooks | (SecureRandom.SecureRandom | Digest.Digest)
> {
  const executor = yield* makeSqlCommitExecutor(unavailable);
  const crypto = yield* SecureRandom.SecureRandom;
  const digests = yield* Digest.Digest;
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
        ).pipe(
          Effect.provideService(SecureRandom.SecureRandom, crypto),
          Effect.provideService(Digest.Digest, digests),
        ),
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
