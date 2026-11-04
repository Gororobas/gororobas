import * as M from "@yielded/auth/Passkey";
import * as Effect from "effect/Effect";

import type { PasskeyCeremonyMapping } from "./models/passkey-model";
import type { NativeSqlTables } from "./native-sql-table";
import { passkeyOperationInputs } from "./passkey-inputs";
import { preparePasskeyNative } from "./passkey-native";
import { makePasskeyNativeFlow } from "./passkey-native-flow";
import { invalidPasskeyState } from "./passkey-native-state";
import { makeSqlCommitExecutor, SqlBatchCommit } from "./sql-commit";
import type { TableModel } from "./table-model";

// Physical SQL expressions are validated by the table compiler.
// oxlint-disable-next-line no-explicit-any
export type NativePasskeyCeremonyMapping = PasskeyCeremonyMapping<TableModel, any>;

export const makeNativePasskeyCeremonyServices = Effect.fnUntraced(function* (
  tables: NativeSqlTables,
  mapping: NativePasskeyCeremonyMapping,
  batch?: SqlBatchCommit["Service"],
) {
  const flow = yield* makePasskeyNativeFlow(tables, mapping);
  const executor = yield* makeSqlCommitExecutor(() => M.PasskeyUnavailable.make({}));

  const run = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
    batch === undefined
      ? executor.run(effect, "statement")
      : executor.batch(effect).pipe(Effect.provideService(SqlBatchCommit, batch));

  const passkeyPersistence: M.PasskeyPersistence["Service"] = {
    issue: () => Effect.fail(M.PasskeyUnavailable.make({})),
    consume: () => Effect.fail(M.PasskeyUnavailable.make({})),
    context: (access) =>
      executor.read(
        Effect.gen(function* () {
          const input = M.snapshotPasskeySync(M.PasskeyAccess, access);

          if (!(input.purpose === "registration")) return yield* invalidPasskeyState();

          return yield* flow.context(input);
        }),
      ),
    cleanup: (original, prepare) =>
      run(
        Effect.gen(function* () {
          const input = M.snapshotPasskeySync(passkeyOperationInputs.cleanup, original);

          if (!flow.validModule(input.moduleId)) return yield* invalidPasskeyState();

          return yield* preparePasskeyNative(
            yield* flow.cleanup(input.moduleId, input.limit, batch !== undefined),
            prepare,
          );
        }),
      ),
  };

  return {
    passkeyPersistence,
    capabilities: {
      purposes: ["registration"] as const,
      issue: "registration-authority" as const,
      assertionConsumption: false as const,
    },
  };
});
