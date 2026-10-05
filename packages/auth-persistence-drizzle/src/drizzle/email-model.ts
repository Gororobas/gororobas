import type * as Shared from "@yielded/auth-persistence/Adapter";
import type { SQL, Table } from "drizzle-orm";

import type { DrizzleTableModel } from "./table-model";

export {
  type RequiredEmailSignInConstraints,
  requiredEmailSignInConstraints,
  type RequiredEmailAddressConstraints,
  requiredEmailAddressConstraints,
  type EmailRegistrationState,
  type EmailRegistrationIntent,
  type RequiredEmailRegistrationConstraints,
  requiredEmailRegistrationConstraints,
} from "@yielded/auth-persistence/Adapter";

export type EmailSubjectReadTable<Subject extends Table> = Shared.EmailSubjectReadTable<
  DrizzleTableModel<Subject>
>;

export type EmailSubjectTable<Subject extends Table> = Shared.EmailSubjectTable<
  DrizzleTableModel<Subject>
>;

export type EmailIdentifierReadTable<Identifier extends Table> = Shared.EmailIdentifierReadTable<
  DrizzleTableModel<Identifier>
>;

export type EmailIdentifierTable<
  Identifier extends Table,
  NativeSubjectId,
> = Shared.EmailIdentifierTable<DrizzleTableModel<Identifier>, NativeSubjectId, SQL>;

export type EmailCredentialReadTable<
  Subject extends Table,
  Identifier extends Table,
  Credential extends Table,
  _NativeSubjectId,
> = Shared.EmailCredentialReadTable<
  DrizzleTableModel<Subject>,
  DrizzleTableModel<Identifier>,
  DrizzleTableModel<Credential>,
  _NativeSubjectId
>;

export type EmailCredentialTable<
  Subject extends Table,
  Identifier extends Table,
  Credential extends Table,
  NativeSubjectId,
> = Shared.EmailCredentialTable<
  DrizzleTableModel<Subject>,
  DrizzleTableModel<Identifier>,
  DrizzleTableModel<Credential>,
  NativeSubjectId
>;

export type EmailAuthorityCredentialTable<
  Credential extends Table,
  NativeSubjectId,
> = Shared.EmailAuthorityCredentialTable<DrizzleTableModel<Credential>, NativeSubjectId>;

export type EmailCommandTable<Command extends Table> = Shared.EmailCommandTable<
  DrizzleTableModel<Command>
>;

export type EmailSignInMapping<
  Subject extends Table,
  Identifier extends Table,
  Credential extends Table,
  NativeSubjectId,
> = Shared.EmailSignInMapping<
  DrizzleTableModel<Subject>,
  DrizzleTableModel<Identifier>,
  DrizzleTableModel<Credential>,
  NativeSubjectId
>;

export type EmailD1Clock = Shared.EmailD1Clock<SQL>;

export type EmailAddressMapping<
  Subject extends Table,
  Identifier extends Table,
  Credential extends Table,
  AuthorityCredential extends Table,
  Command extends Table,
  NativeSubjectId,
> = Shared.EmailAddressMapping<
  DrizzleTableModel<Subject>,
  DrizzleTableModel<Identifier>,
  DrizzleTableModel<Credential>,
  DrizzleTableModel<AuthorityCredential>,
  DrizzleTableModel<Command>,
  NativeSubjectId,
  SQL
>;

export type D1EmailAddressMapping<
  Subject extends Table,
  Identifier extends Table,
  Credential extends Table,
  AuthorityCredential extends Table,
  Command extends Table,
  NativeSubjectId,
> = Shared.D1EmailAddressMapping<
  DrizzleTableModel<Subject>,
  DrizzleTableModel<Identifier>,
  DrizzleTableModel<Credential>,
  DrizzleTableModel<AuthorityCredential>,
  DrizzleTableModel<Command>,
  NativeSubjectId,
  SQL
>;

export type EmailRegistrationTable<
  Registration,
  Request extends Table,
  NativeSubjectId,
> = Shared.EmailRegistrationTable<Registration, DrizzleTableModel<Request>, NativeSubjectId>;

export type EmailRegistrationProvisioning<
  Registration,
  Subject extends Table,
  NativeSubjectId,
> = Shared.EmailRegistrationProvisioning<Registration, DrizzleTableModel<Subject>, NativeSubjectId>;

export type EmailRegistrationIdentifierTable<
  Identifier extends Table,
  NativeSubjectId,
> = Shared.EmailRegistrationIdentifierTable<DrizzleTableModel<Identifier>, NativeSubjectId, SQL>;

export type EmailRegistrationCredentialTable<
  Credential extends Table,
  NativeSubjectId,
> = Shared.EmailRegistrationCredentialTable<DrizzleTableModel<Credential>, NativeSubjectId>;

export type EmailRegistrationAuthorityCredentialTable<
  Credential extends Table,
  NativeSubjectId,
> = Shared.EmailRegistrationAuthorityCredentialTable<
  DrizzleTableModel<Credential>,
  NativeSubjectId
>;

export type EmailRegistrationMapping<
  Registration,
  Subject extends Table,
  Identifier extends Table,
  Credential extends Table,
  AuthorityCredential extends Table,
  Request extends Table,
  NativeSubjectId,
> = Shared.EmailRegistrationMapping<
  Registration,
  DrizzleTableModel<Subject>,
  DrizzleTableModel<Identifier>,
  DrizzleTableModel<Credential>,
  DrizzleTableModel<AuthorityCredential>,
  DrizzleTableModel<Request>,
  NativeSubjectId,
  SQL
>;

export type AnyEmailSignInMapping = EmailSignInMapping<Table, Table, Table, unknown>;

export type AnyEmailAddressMapping = EmailAddressMapping<
  Table,
  Table,
  Table,
  Table,
  Table,
  unknown
>;

export type AnyEmailRegistrationMapping<Registration = unknown> = EmailRegistrationMapping<
  Registration,
  Table,
  Table,
  Table,
  Table,
  Table,
  unknown
>;

export type D1EmailRegistrationMapping<
  Registration,
  Subject extends Table,
  Identifier extends Table,
  Credential extends Table,
  AuthorityCredential extends Table,
  Request extends Table,
  NativeSubjectId,
> = Shared.D1EmailRegistrationMapping<
  Registration,
  DrizzleTableModel<Subject>,
  DrizzleTableModel<Identifier>,
  DrizzleTableModel<Credential>,
  DrizzleTableModel<AuthorityCredential>,
  DrizzleTableModel<Request>,
  NativeSubjectId,
  SQL
>;
