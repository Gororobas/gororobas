import type * as Shared from "@yielded/auth-persistence/Adapter";
import type { SQL, Table } from "drizzle-orm";

import type { DrizzleTableModel } from "./table-model";

export {
  type PasskeyRegistrationCeremonyCapabilities,
  type PasskeyRegistrationCeremonyServices,
  requiredPasskeyRegistrationCeremonyConstraints,
} from "@yielded/auth-persistence/Adapter";

/** Read-only custody supplied by a separate registration issuance authority.
 * No application payload codec, subject codec or provisioning callback runs here. */
export type PasskeyRegistrationIntentReadTable<T extends Table> =
  Shared.PasskeyRegistrationIntentReadTable<DrizzleTableModel<T>, SQL>;

export type PasskeyRegistrationCeremonyMapping<
  Module extends Table,
  Flow extends Table,
  Admission extends Table,
  Charge extends Table,
  Intent extends Table,
  Handle extends Table,
> = Shared.PasskeyRegistrationCeremonyMapping<
  DrizzleTableModel<Module>,
  DrizzleTableModel<Flow>,
  DrizzleTableModel<Admission>,
  DrizzleTableModel<Charge>,
  DrizzleTableModel<Intent>,
  DrizzleTableModel<Handle>,
  SQL
>;
