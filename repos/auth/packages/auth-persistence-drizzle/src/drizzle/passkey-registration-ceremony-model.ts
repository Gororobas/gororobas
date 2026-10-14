import type * as Shared from "@yielded/auth-persistence/Adapter";
import type { SQL, Table } from "drizzle-orm";

import type { DrizzleTableModel } from "./table-model";

export type {
  PasskeyRegistrationCeremonyCapabilities,
  PasskeyRegistrationCeremonyServices,
} from "@yielded/auth-persistence/Adapter";

export type PasskeyRegistrationCeremonyMapping<Flow extends Table> =
  Shared.PasskeyRegistrationCeremonyMapping<DrizzleTableModel<Flow>, SQL>;
