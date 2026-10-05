import type { AnyRelations } from "drizzle-orm";
import type { EffectMysql2Database } from "drizzle-orm/effect-mysql2";
import { Context } from "effect";

/** Application-owned MySQL database used to construct persistence services. */
export class Database extends Context.Service<Database, EffectMysql2Database<AnyRelations>>()(
  "effect-auth/persistence-drizzle/Mysql2/Database",
) {}
