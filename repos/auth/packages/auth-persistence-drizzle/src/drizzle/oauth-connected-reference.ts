import { eq, is, sql, type SQL, type Table } from "drizzle-orm";
import { MySqlTable } from "drizzle-orm/mysql-core/table";
import { PgTable } from "drizzle-orm/pg-core/table";

import type { OAuthConnectedMapping } from "./oauth-connected-model";
import { scopeKey, type Mapping } from "./oauth-connected-state";
import { oauthReferenceGuardTable, type OAuthReferenceGuardDescriptor } from "./oauth-model";
import { both, col, equal } from "./oauth-owner";
import { captureOAuthMapping } from "./oauth-state";

const exactText = (table: Table, key: string, value: string) => {
  const column = col(table, key),
    bound = sql.param(value, column);

  return is(table, MySqlTable)
    ? sql`binary ${column} = binary ${bound}`
    : is(table, PgTable)
      ? sql`convert_to(cast(${column} as text),'UTF8') = convert_to(cast(${bound} as text),'UTF8')`
      : sql`cast(${column} as blob) = cast(${bound} as blob)`;
};

/** Compose Accounts.Unlink with this connected authority. The stable scope lock
 * serializes unknown claims across every client registration for an issuer. */
export const oauthConnectedOwnershipReferences = <
  S extends Table,
  AC extends Table,
  T extends Table,
  O extends Table,
  F extends Table,
  G extends Table,
  C extends Table,
  H extends Table,
  A extends Table,
  D extends Table,
  N,
  J extends Table,
>(
  original: OAuthConnectedMapping<S, AC, T, O, F, G, C, H, A, D, N, J>,
): {
  readonly connectedReferenceGuards: ReadonlyArray<OAuthReferenceGuardDescriptor<N>>;
  readonly connectedReference: (input: {
    readonly identityKey: string;
    readonly subjectId: N;
  }) => SQL;
} => {
  const mapping = captureOAuthMapping(original),
    c = mapping.client;

  return Object.freeze({
    connectedReferenceGuards: [
      oauthReferenceGuardTable<C, N>({
        table: c.table,
        orderBy: c.clientKey,
        condition: (input) =>
          both(
            equal(c.table, {
              [c.clientKey]: scopeKey(input.identity.provider, input.identity.issuer),
              [c.counter]: mapping.order.encode(0),
            }),
            exactText(c.table, c.provider, input.identity.provider),
            exactText(c.table, c.issuer, input.identity.issuer),
            exactText(c.table, c.clientRegistrationId, ""),
          ),
      }),
    ],
    connectedReference: (input) => connectedReferenceCondition(mapping, input.identityKey),
  });
};

export const connectedReferenceCondition = (
  mapping: Mapping,
  identityKey: string | SQL,
  knownIdentity?: { readonly provider: string | SQL; readonly issuer: string | SQL },
) => {
  const c = mapping.client,
    t = mapping.ownership.tuple,
    f = mapping.flow,
    g = mapping.grant,
    h = mapping.cohort,
    a = mapping.admission,
    j = mapping.revocation.mode === "cohort" ? mapping.revocation.job : undefined;

  const tuple = equal(t.table, { [t.identityKey]: identityKey });
  const knownFlow = sql`exists(select 1 from ${h.table} where ${col(h.table, h.cohortKey)} = ${col(f.table, f.cohortKey)} and ${col(h.table, h.identityKey)} = ${identityKey})`;

  const unknownFlow =
    knownIdentity === undefined
      ? sql`${col(f.table, f.cohortKey)} is null and exists(select 1 from ${c.table} where ${col(c.table, c.clientKey)} = ${col(f.table, f.clientKey)} and exists(select 1 from ${t.table} where ${tuple} and ${col(c.table, c.provider)} = ${col(t.table, t.provider)} and ${col(c.table, c.issuer)} = ${col(t.table, t.issuer)}))`
      : sql`${col(f.table, f.cohortKey)} is null and exists(select 1 from ${c.table} where ${col(c.table, c.clientKey)} = ${col(f.table, f.clientKey)} and ${col(c.table, c.provider)} = ${knownIdentity.provider} and ${col(c.table, c.issuer)} = ${knownIdentity.issuer})`;

  const related = [f, g, h, ...(j === undefined ? [] : [j])];

  return sql`(${sql.join(
    [
      sql`exists(select 1 from ${g.table} where ${eq(col(g.table, g.identityKey), identityKey)})`,
      sql`exists(select 1 from ${a.table} where ${eq(col(a.table, a.identityKey), identityKey)})`,
      sql`exists(select 1 from ${h.table} where ${both(eq(col(h.table, h.identityKey), identityKey), eq(col(h.table, h.state), "Blocked"))})`,
      sql`exists(select 1 from ${f.table} where ${col(f.table, f.work)} = 'Unresolved' and (${knownFlow} or (${unknownFlow})))`,
      ...(j === undefined
        ? []
        : [
            sql`exists(select 1 from ${j.table} where ${eq(col(j.table, j.identityKey), identityKey)})`,
          ]),
      // A missing real client cannot turn erased unknown work into absence.
      ...related.map(
        (v) =>
          sql`exists(select 1 from ${v.table} where not exists(select 1 from ${c.table} where ${col(c.table, c.clientKey)} = ${col(v.table, v.clientKey)}))`,
      ),
    ],
    sql` or `,
  )})`;
};
