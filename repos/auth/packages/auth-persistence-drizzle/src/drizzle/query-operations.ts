import type { QueryOperations } from "@yielded/auth-persistence/Adapter";
import {
  type SQL,
  type AnyColumn,
  and,
  asc,
  or,
  eq,
  gt,
  gte,
  lte,
  inArray,
  isNull,
  notExists,
  sql,
  getTableColumns,
} from "drizzle-orm";

import { balancedD1And, compactD1GeneratedStatement } from "./d1-generated-statement";
import { column, updateValues } from "./model";
import { validateDrizzleStorage } from "./storage-validation";

const operations = {
  validateStorage: validateDrizzleStorage,
  and,
  asc,
  or,
  eq,
  gt,
  gte,
  lte,
  inArray,
  isNull,
  notExists,
  sql,
  getTableColumns,
  column,
  updateValues,
  balancedD1And,
  compactD1GeneratedStatement,
};

/** The shared kernel only passes tables and expressions from this compiler.
 * Erasure stops at query shapes; row codecs and Effect errors remain explicit. */
export const drizzleQueryOperations = operations as unknown as QueryOperations<SQL, AnyColumn>;
