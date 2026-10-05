import type { AnyRelations } from "drizzle-orm";
import type { EffectPgDatabase as PgliteDatabase } from "drizzle-orm/effect-pglite";
import type { EffectPgDatabase as PostgresDatabase } from "drizzle-orm/effect-postgres";
import { Context } from "effect";

/** Application-owned PostgreSQL database; Postgres and Pglite share this service. */
export class Database extends Context.Service<
  Database,
  PostgresDatabase<AnyRelations> | PgliteDatabase<AnyRelations>
>()("effect-auth/persistence-drizzle/Postgres/Database") {}
