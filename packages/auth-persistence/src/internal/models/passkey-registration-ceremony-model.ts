import type { TableModel as Table, SqlExpression } from "../query-operations";
import type {
  PasskeyCeremonyMapping,
  PasskeyChargeTable,
  PasskeyColumn,
  PasskeyFlowTable,
  PasskeyHandleReservationTable,
  PasskeyPersistenceServices,
} from "./passkey-model";

export interface PasskeyRegistrationCeremonyCapabilities {
  readonly purposes: readonly ["registration"];
  readonly issue: "registration-authority";
  readonly assertionSettlement: false;
}

export interface PasskeyRegistrationCeremonyServices extends PasskeyPersistenceServices {
  readonly capabilities: PasskeyRegistrationCeremonyCapabilities;
}

/** Read-only custody supplied by a separate registration issuance authority.
 * No application payload codec, subject codec or provisioning callback runs here. */
export interface PasskeyRegistrationIntentReadTable<
  T extends Table,
  Expression extends SqlExpression = SqlExpression,
> {
  readonly table: T["table"];
  readonly moduleId: PasskeyColumn<T>;
  readonly flowId: PasskeyColumn<T>;
  readonly commandId: PasskeyColumn<T>;
  readonly state: PasskeyColumn<T>;
  readonly version: PasskeyColumn<T>;
  readonly fingerprint: PasskeyColumn<T>;
  readonly handleKey: PasskeyColumn<T>;
  readonly reservationId: PasskeyColumn<T>;
  readonly ceremonySnapshot: PasskeyColumn<T>;
  /** Already validated by the issuing authority; compare opaque bytes only. */
  readonly applicationSnapshot: PasskeyColumn<T>;
  readonly pendingCondition: Expression;
  readonly isPendingState: (value: unknown) => boolean;
  /** Any unresolved initial intent or provisioning job; cleanup never releases it. */
  readonly custodyCondition: Expression;
}

export const requiredPasskeyRegistrationCeremonyConstraints = {
  flow: ["moduleId", "flowId"],
  command: ["moduleId", "commandId"],
  admission: ["authorityScope", "moduleId"],
  charge: ["moduleId", "flowId", "kind"],
  intentFlow: ["moduleId", "flowId"],
  intentCommand: ["moduleId", "commandId"],
  handle: ["handleKey"],
} as const;

export interface PasskeyRegistrationCeremonyMapping<
  Module extends Table,
  Flow extends Table,
  Admission extends Table,
  Charge extends Table,
  Intent extends Table,
  Handle extends Table,
  Expression extends SqlExpression = SqlExpression,
> extends Omit<
  PasskeyCeremonyMapping<Module, Flow, Admission, Charge, Expression>,
  "constraints" | "flow" | "charge"
> {
  readonly flow: Omit<PasskeyFlowTable<Flow>, "encodeInsert">;
  readonly charge: Omit<PasskeyChargeTable<Charge>, "encodeInsert">;
  readonly intent: PasskeyRegistrationIntentReadTable<Intent, Expression>;
  readonly handle: PasskeyHandleReservationTable<Handle, Expression>;
  readonly constraints: typeof requiredPasskeyRegistrationCeremonyConstraints;
}
