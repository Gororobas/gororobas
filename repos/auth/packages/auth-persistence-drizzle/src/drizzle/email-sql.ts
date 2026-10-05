import { makeEmailKernel } from "@yielded/auth-persistence/Adapter";

import { completeProofPlanIn } from "./proof-sql";
import { drizzleQueryOperations } from "./query-operations";

export { CurrentEmailSql } from "@yielded/auth-persistence/Adapter";

export type {
  EmailSqlQuery,
  EmailSqlDatabase,
  EmailSqlConfiguration,
  CurrentAddress,
} from "@yielded/auth-persistence/Adapter";

export const {
  validEmailSignInConstraints,
  emailLookupQuery,
  decodeEmailSnapshot,
  makeSqlEmailSignInTargets,
  currentAddress,
  sameEmailRevision,
  snapshotEmailMutation,
  validateEmailAuthority,
  makeSqlEmailAddressPersistence,
} = makeEmailKernel(drizzleQueryOperations, { completeProofPlanIn });
