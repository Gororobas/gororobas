import type * as Shared from "./models/oauth-connected-model";
import type { SqlExpression as SQL } from "./sql-expression";
import type { SqlTableModel } from "./sql-oauth-model";
import type { Table } from "./sql-table";

export {
  type OAuthConnectedAction,
  type OAuthConnectedPolicyInput,
  requiredOAuthConnectedConstraints,
  requiredOAuthConnectedRevocationConstraints,
} from "./models/oauth-connected-model";

export type OAuthConnectedGrantTable<G extends Table, N> = Shared.OAuthConnectedGrantTable<
  SqlTableModel<G>,
  N
>;

export type OAuthConnectedRevocationJobTable<
  J extends Table,
  N,
> = Shared.OAuthConnectedRevocationJobTable<SqlTableModel<J>, N>;

export type OAuthConnectedSqlPolicy<N> = Shared.OAuthConnectedSqlPolicy<N, SQL>;

export type OAuthConnectedMapping<
  S extends Table,
  AC extends Table,
  O extends Table,
  F extends Table,
  G extends Table,
  N,
  J extends Table = Table,
> = Shared.OAuthConnectedMapping<
  SqlTableModel<S>,
  SqlTableModel<AC>,
  SqlTableModel<O>,
  SqlTableModel<F>,
  SqlTableModel<G>,
  N,
  SqlTableModel<J>,
  SQL,
  SqlTableModel
>;

export type OAuthConnectedRevocationMapping<
  O extends Table,
  G extends Table,
  J extends Table,
  N,
> = Shared.OAuthConnectedRevocationMapping<
  SqlTableModel<O>,
  SqlTableModel<G>,
  SqlTableModel<J>,
  N,
  SQL
>;
