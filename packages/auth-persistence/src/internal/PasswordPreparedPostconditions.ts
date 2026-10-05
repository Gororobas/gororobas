import type { PreparedCommit } from "@yielded/auth/Hooks";
import type { PasswordUnavailable } from "@yielded/auth/Password";
import type { ProofUnavailable } from "@yielded/auth/Proofs";
import { Context, type Effect } from "effect";

import type { PasswordSqlDatabase } from "./password-kernel";

/** Final reads resolve the current physical owner, never a released savepoint. */
export class CurrentPasswordPreparedTransaction extends Context.Service<
  CurrentPasswordPreparedTransaction,
  PasswordSqlDatabase
>()("effect-auth/drizzle/CurrentPasswordPreparedTransaction") {}

export type PasswordPreparedPostcondition = Effect.Effect<
  void,
  PasswordUnavailable | ProofUnavailable,
  CurrentPasswordPreparedTransaction
>;

/** Registration ends when the application owner returns, before final validation. */
export class PasswordPreparedPostconditions extends Context.Service<
  PasswordPreparedPostconditions,
  { readonly register: (check: PasswordPreparedPostcondition) => boolean }
>()("effect-auth/drizzle/PasswordPreparedPostconditions") {}

/** Journal registration closes with the prepared-password owner callback. */
export class PasswordPreparedJournalGuards extends Context.Service<
  PasswordPreparedJournalGuards,
  { readonly register: (guard: PreparedCommit<void>) => boolean }
>()("effect-auth/drizzle/PasswordPreparedJournalGuards") {}
