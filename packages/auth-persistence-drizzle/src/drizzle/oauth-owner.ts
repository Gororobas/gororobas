import type { CommitJournal } from "@yielded/auth/Hooks";
import type { OAuthUnavailable } from "@yielded/auth/OAuth";
/* oxlint-disable no-explicit-any -- private adapter preserves the existing driver boundary. */
import { Context } from "effect";

import { unavailable } from "./oauth-state";
import {
  makeTransactionOwner,
  makeTransactionRows,
  type TransactionNativeDatabase,
  type TransactionOwner,
} from "./transaction-owner";

export { both, type Observation, type Row } from "./transaction-owner";
export const { col, equal, copiedRow, matchesNativeRow } = makeTransactionRows(unavailable);
export type OAuthOwner = TransactionOwner<OAuthUnavailable>;

export class CurrentOAuthTransaction extends Context.Service<CurrentOAuthTransaction, OAuthOwner>()(
  "effect-auth/drizzle/CurrentOAuthTransaction",
) {}

export type OAuthNativeDatabase = TransactionNativeDatabase;

export const makeOAuthOwner = (
  database: any,
  journal: CommitJournal,
  marker: string,
  configuration: Parameters<typeof makeTransactionOwner>[4],
): OAuthOwner => makeTransactionOwner(database, journal, marker, unavailable, configuration);
