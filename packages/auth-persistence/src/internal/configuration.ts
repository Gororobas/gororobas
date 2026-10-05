import type { EmailAction, EmailAddressPersistence } from "@yielded/auth/Email";
import type { LoginIdentifier } from "@yielded/auth/Identity";
import type {
  PasskeyActionChallenge,
  PasskeyConfig,
  PasskeyCredentials,
  PasskeyEnrollmentContext,
  PasskeyManagementPersistence,
  PasskeyManagementPolicy,
  PasskeyMethodPolicy,
  PasskeyPersistence,
  PasskeyConfigurationError,
} from "@yielded/auth/Passkey";
import type {
  PasswordAction,
  PasswordPersistence,
  PasswordUnavailable,
} from "@yielded/auth/Password";
import type { PhoneAdmission, PhoneSignInTargets } from "@yielded/auth/PhoneOtp";
import type { ProofPersistence } from "@yielded/auth/Proofs";
import type { SubjectId } from "@yielded/auth/Schema";
import type {
  AuthenticationAuthority,
  AuthenticationRequirement,
  make as makeSessions,
} from "@yielded/auth/Sessions";
import { type Context, type Effect, type Layer, Schema } from "effect";
import type { SqlClient } from "effect/sql";

import type { PersistenceMappingError } from "./mapping-error";
import type { StorageRole } from "./storage-tables";

export class PersistenceConfigurationError extends Schema.TaggedError<PersistenceConfigurationError>()(
  "PersistenceConfigurationError",
  { reason: Schema.String },
) {}

export type ClaimsCodec = Schema.Codec<unknown, unknown, never, never>;

export interface PasskeyFeature {
  readonly kind: "passkey";
  readonly moduleId: string;
  readonly policy: Effect.Effect<PasskeyMethodPolicy, PasskeyConfigurationError, PasskeyConfig>;
  readonly management?: boolean;
  readonly managementPolicy?: PasskeyManagementPolicy;
}

export interface Strategy {
  readonly strategy: object;
  readonly persistence?:
    | PasskeyFeature
    | {
        readonly kind: "password" | "phone" | "email";
        readonly moduleId: string;
        readonly lifecycle?: boolean;
        readonly management?: boolean;
        readonly addresses?: boolean;
      };
  readonly RegistrationAuthority?: Context.Key<unknown, unknown>;
}

export interface Definition<C extends ClaimsCodec, Id extends string> {
  readonly namespace: string;
  readonly claims: C;
  readonly sessionMode?: string | undefined;
  readonly sessions: ReturnType<typeof makeSessions<C, Id>>;
  readonly strategies: Readonly<Record<string, Strategy>>;
}

type KeyId<T> = T extends Context.Key<infer Id, infer _Service> ? Id : never;
type Enabled<
  A extends { readonly strategies: Readonly<Record<string, Strategy>> },
  Kind extends "password" | "phone" | "email" | "passkey",
> = Extract<A["strategies"][keyof A["strategies"]], { persistence: { kind: Kind } }>;

type ManagedPassword<A extends { readonly strategies: Readonly<Record<string, Strategy>> }> =
  Extract<Enabled<A, "password">, { persistence: { management: true } }>;

type ManagedPasskey<A extends { readonly strategies: Readonly<Record<string, Strategy>> }> =
  Extract<Enabled<A, "passkey">, { persistence: { management: true } }>;

export type PasskeyRequirement<
  A extends { readonly strategies: Readonly<Record<string, Strategy>> },
> = Enabled<A, "passkey"> extends never ? never : PasskeyConfig;

type RegistrationKey<S> = S extends { readonly RegistrationAuthority: infer K } ? K : never;
type Registration<S> =
  RegistrationKey<S> extends Context.Key<infer _Id, infer Service>
    ? Service extends { readonly register: (input: infer Input, ...args: never[]) => unknown }
      ? Input extends { readonly registration: infer Value }
        ? Value
        : never
      : never
    : never;

export interface ProvisioningId<Id extends string> {
  readonly authNamespace: Id;
  readonly service: "PersistenceProvisioning";
}

export type Provisioning<A extends { readonly strategies: Readonly<Record<string, Strategy>> }> = {
  readonly [
    K in keyof A["strategies"] as A["strategies"][K] extends {
      persistence: { kind: "password"; management: true };
    }
      ? K
      : never
  ]: (input: {
    readonly identifier: LoginIdentifier;
    readonly registration: Registration<A["strategies"][K]>;
  }) => Effect.Effect<SubjectId, PasswordUnavailable>;
};

export type ProvisioningRequirement<
  A extends { readonly namespace: string; readonly strategies: Readonly<Record<string, Strategy>> },
> = ManagedPassword<A> extends never ? never : ProvisioningId<A["namespace"]>;

type ProofRoles =
  | "proofRequests"
  | "proofSeries"
  | "proofGenerations"
  | "proofContinuations"
  | "proofScopes"
  | "proofAbuse"
  | "proofFailures"
  | "proofCommands";

type UsesProofs<A extends { readonly strategies: Readonly<Record<string, Strategy>> }> =
  | Enabled<A, "phone">
  | Enabled<A, "email">
  | ManagedPassword<A>;

export type Ports<C extends ClaimsCodec, Id extends string, A extends Definition<C, Id>> =
  | AuthenticationAuthority
  | KeyId<A["sessions"]["StatefulSessionPersistence"]>
  | KeyId<A["sessions"]["SessionRepository"]>
  | (Enabled<A, "password"> extends never ? never : PasswordPersistence)
  | KeyId<RegistrationKey<ManagedPassword<A>>>
  | (Enabled<A, "passkey"> extends never ? never : PasskeyPersistence | PasskeyCredentials)
  | (ManagedPasskey<A> extends never
      ? never
      : PasskeyManagementPersistence | PasskeyEnrollmentContext)
  | (Enabled<A, "email"> extends never ? never : EmailAddressPersistence)
  | (UsesProofs<A> extends never ? never : ProofPersistence)
  | (Enabled<A, "phone"> extends never ? never : PhoneAdmission | PhoneSignInTargets);

export type Roles<C extends ClaimsCodec, Id extends string, A extends Definition<C, Id>> =
  | "identifiers"
  | "credentials"
  | "sessions"
  | "sessionFlows"
  | (Enabled<A, "password"> extends never
      ? never
      :
          | "passwords"
          | "passwordAttempts"
          | "passwordScopes"
          | "passwordCharges"
          | "passwordCommands")
  | (ManagedPassword<A> extends never ? never : "passwordRegistrations")
  | (Enabled<A, "phone"> extends never ? never : "phoneState")
  | (Enabled<A, "email"> extends never ? never : "emailCredentials" | "emailCommands")
  | (Enabled<A, "passkey"> extends never
      ? never
      :
          | "passkeyCredentials"
          | "passkeyOwnership"
          | "passkeyHandles"
          | "passkeyModules"
          | "passkeyFlows"
          | "passkeyAdmissions"
          | "passkeyCharges")
  | (ManagedPasskey<A> extends never ? never : "passkeyCommands")
  | (UsesProofs<A> extends never ? never : ProofRoles);

export interface SubjectOptions<T extends object, NativeId> {
  readonly table: T;
  readonly id: string;
  readonly status: string;
  readonly activeValue: unknown;
  readonly securityRevision: string;
  readonly idCodec: Schema.Codec<SubjectId, NativeId>;
  readonly requirements: (
    row: Readonly<Record<string, unknown>>,
  ) => Effect.Effect<AuthenticationRequirement, PersistenceMappingError>;
  /** Defaults to sign-in requirements. Recovery can have a distinct application policy. */
  readonly actionRequirements?: (
    row: Readonly<Record<string, unknown>>,
    action: PasswordAction | EmailAction | PasskeyActionChallenge["action"],
  ) => Effect.Effect<AuthenticationRequirement, PersistenceMappingError>;
}

/** Codecs at the application-owned subject and timestamp boundary. */
export interface SubjectMapping {
  readonly table: object;
  readonly id: string;
  readonly status: string;
  readonly securityRevision: string;
  readonly activeValue: unknown;
  readonly requirements: SubjectOptions<object, unknown>["requirements"];
  readonly actionRequirements: NonNullable<SubjectOptions<object, unknown>["actionRequirements"]>;
  readonly toSubject: (value: unknown) => Effect.Effect<SubjectId, PersistenceMappingError>;
  readonly toNative: (value: SubjectId) => Effect.Effect<unknown, PersistenceMappingError>;
  readonly toSubjectSync: (value: unknown) => SubjectId;
  readonly toNativeSync: (value: SubjectId) => unknown;
}

export interface MappingInput {
  readonly tables: Partial<Record<StorageRole, object>>;
  readonly subjects: SubjectMapping;
  readonly encodeInstant: (millis: number) => unknown;
  readonly decodeInstant: (value: unknown) => Effect.Effect<number, PersistenceMappingError>;
  readonly decodeInstantSync: (value: unknown) => number;
}

export interface StorageLayout<
  T extends object,
  Role extends StorageRole = StorageRole,
> extends MappingInput {
  readonly namespace: string;
  readonly schema: Readonly<Record<Role, T>>;
}

export interface ConfigId<Id extends string> {
  readonly authNamespace: Id;
  readonly service: "PersistenceConfig";
}

export interface TimestampOptions<Instant> {
  readonly type: "text" | "integer";
  readonly codec: Schema.Codec<number, Instant>;
}

export interface BoundPersistence<
  T extends object,
  R,
  C extends ClaimsCodec,
  Id extends string,
  A extends Definition<C, Id>,
> {
  readonly Config: Context.Service<ConfigId<A["namespace"]>, StorageLayout<T, Roles<C, Id, A>>> & {
    readonly layer: (
      value: StorageLayout<T, Roles<C, Id, A>>,
    ) => Layer.Layer<ConfigId<A["namespace"]>>;
  };
  /** Create only the application subject. Runs inside the owning auth SQL transaction;
   * use that SqlClient (including Drizzle over it), and return the new subject ID.
   * Do not perform external side effects or open an independent transaction here.
   */
  readonly Provisioning: Context.Service<ProvisioningRequirement<A>, Provisioning<A>>;
  readonly layer: Layer.Layer<
    Ports<C, Id, A>,
    PersistenceConfigurationError,
    | ConfigId<A["namespace"]>
    | ProvisioningRequirement<A>
    | PasskeyRequirement<A>
    | SqlClient.SqlClient
    | R
  >;
  readonly managed: <N, Instant = number>(options: {
    readonly subjects: SubjectOptions<T, N>;
    readonly tables?: Partial<Record<Roles<C, Id, A>, T>>;
    readonly prefix?: string;
    readonly timestamps?: TimestampOptions<Instant>;
  }) => StorageLayout<T, Roles<C, Id, A>>;
  readonly map: <N, Instant = number>(options: {
    readonly subjects: SubjectOptions<T, N>;
    readonly tables: Readonly<Record<Roles<C, Id, A>, T>>;
    readonly timestamps?: TimestampOptions<Instant>;
  }) => StorageLayout<T, Roles<C, Id, A>>;
}

/** Shared configuration shape. The backend chooses table types and service requirements. */
export interface PersistenceApi<T extends object, R = never> {
  readonly make: <
    C extends ClaimsCodec,
    const Id extends string,
    const A extends Definition<C, Id>,
  >(
    auth: A & Definition<C, Id>,
  ) => BoundPersistence<T, R, C, Id, A>;
}
