import { cryptoLayer, hooksLayer } from "@yielded/auth/Persistence";
import {
  type PhoneAdmissionPolicy,
  type PhoneLifecyclePolicy,
  type PhoneNumber,
  PhoneAdmission,
  PhonePersistence,
  PhoneSignInTargets,
} from "@yielded/auth/PhoneOtp";
import type { SubjectId } from "@yielded/auth/Schema";
import type { AuthenticationRequirement } from "@yielded/auth/Sessions";
import type { InferInsertModel, InferSelectModel, SQL, Table } from "drizzle-orm";
import { Effect, Layer } from "effect";

import type { PersistenceMappingError } from "./model";
import type { AnyProofPersistenceMapping, ProofPersistenceMapping } from "./proof-model";
const proofMapping = Symbol("effect-auth/phone/proofs");

/** Opaque same-owner proof mapping. The builder preserves the consumer's table codecs. */
export interface PhoneProofCompletionMapping {
  readonly [proofMapping]: AnyProofPersistenceMapping;
}

export const phoneProofCompletionMapping = <
  Rq extends Table,
  S extends Table,
  G extends Table,
  Cn extends Table,
  Rs extends Table,
  A extends Table,
  F extends Table,
  C extends Table,
  Sub extends Table,
  I extends Table,
  Cr extends Table,
  N,
>(
  mapping: ProofPersistenceMapping<Rq, S, G, Cn, Rs, A, F, C, Sub, I, Cr, N>,
): PhoneProofCompletionMapping =>
  Object.freeze({
    [proofMapping]: Object.freeze({
      ...mapping,
      request: Object.freeze({ ...mapping.request }),
      series: Object.freeze({ ...mapping.series }),
      generation: Object.freeze({ ...mapping.generation }),
      continuation: Object.freeze({ ...mapping.continuation }),
      rateScope: Object.freeze({ ...mapping.rateScope }),
      abuseEvent: Object.freeze({ ...mapping.abuseEvent }),
      failureEvent: Object.freeze({ ...mapping.failureEvent }),
      command: Object.freeze({ ...mapping.command }),
      constraints: Object.freeze({ ...mapping.constraints }),
      authority: Object.freeze({
        ...mapping.authority,
        identifier: Object.freeze({ ...mapping.authority.identifier }),
        ...(mapping.authority.subject === undefined
          ? {}
          : { subject: Object.freeze({ ...mapping.authority.subject }) }),
        ...(mapping.authority.credential === undefined
          ? {}
          : { credential: Object.freeze({ ...mapping.authority.credential }) }),
        ...(mapping.authority.subjectId === undefined
          ? {}
          : { subjectId: Object.freeze({ ...mapping.authority.subjectId }) }),
      }),
      ...(mapping.d1 === undefined ? {} : { d1: Object.freeze({ ...mapping.d1 }) }),
    }) as unknown as AnyProofPersistenceMapping,
  });

/** @internal */
export const phoneProofs = (mapping: PhoneProofCompletionMapping) => mapping[proofMapping];
export type PhoneColumn<T extends Table> = Extract<keyof T["_"]["columns"], string>;
export type PhoneMappingSource<M, R = never> = M | Effect.Effect<M, PersistenceMappingError, R>;

export const requiredPhoneConstraints = {
  subject: "unique(id)",
  identifier: "unique(namespace,value)",
  credential: "unique(credentialId)",
  state: "unique(scope)",
} as const;

/** Consumer-owned schema; encoders and allocators are synchronous and side-effect free.
 * State stores permanent number custody and command tombstones, plus bounded admission
 * counters. Never delete custody rows to make a recycled number eligible. A consumer's
 * explicit recovery workflow may resolve custody only after independent authentication.
 * Subject defaults own account provisioning; no email/profile schema is prescribed. */
export interface PhoneMapping<
  S extends Table,
  I extends Table,
  C extends Table,
  T extends Table,
  N,
> {
  readonly moduleId: string;
  readonly policy: PhoneLifecyclePolicy;
  readonly admission: PhoneAdmissionPolicy;
  readonly constraints: typeof requiredPhoneConstraints;
  readonly proofs: PhoneProofCompletionMapping;
  readonly subjectIds: {
    readonly toNative: (id: SubjectId) => N;
    readonly toSubject: (id: N) => SubjectId;
    readonly allocate: () => N;
  };
  readonly subject: {
    readonly table: S;
    readonly id: PhoneColumn<S>;
    readonly securityRevision: PhoneColumn<S>;
    readonly activeCondition: SQL;
    readonly decodeRequirement: (row: InferSelectModel<S>) => AuthenticationRequirement;
    /** Current action policy, independently from primary sign-in assurance. */
    readonly decodeActionRequirement?: (
      row: InferSelectModel<S>,
      action: "verify" | "change",
    ) => AuthenticationRequirement;
    readonly encodeInsert: (input: {
      readonly id: N;
      readonly securityRevision: string;
      readonly phoneNumber: PhoneNumber;
    }) => InferInsertModel<S>;
  };
  readonly identifier: {
    readonly table: I;
    readonly namespace: PhoneColumn<I>;
    readonly value: PhoneColumn<I>;
    readonly subjectId: PhoneColumn<I>;
    readonly revision: PhoneColumn<I>;
    readonly verifiedAt: PhoneColumn<I>;
    readonly status: PhoneColumn<I>;
    readonly activeCondition: SQL;
    readonly encodeStatus: (active: boolean) => unknown;
    readonly encodeInsert: (input: {
      readonly phoneNumber: PhoneNumber;
      readonly subjectId: N;
      readonly revision: string;
      readonly verifiedAtMillis: number;
      readonly active: boolean;
    }) => InferInsertModel<I>;
  };
  readonly credential: {
    readonly table: C;
    readonly id: PhoneColumn<C>;
    readonly subjectId: PhoneColumn<C>;
    readonly revision: PhoneColumn<C>;
    readonly status: PhoneColumn<C>;
    readonly activeCondition: SQL;
    readonly encodeStatus: (active: boolean) => unknown;
    readonly encodeInsert: (input: {
      readonly credentialId: string;
      readonly subjectId: N;
      readonly revision: string;
      readonly active: boolean;
    }) => InferInsertModel<C>;
  };
  readonly state: {
    readonly table: T;
    readonly scope: PhoneColumn<T>;
    readonly state: PhoneColumn<T>;
    readonly version: PhoneColumn<T>;
    readonly encodeInsert: (input: {
      readonly scope: string;
      readonly state: string;
      readonly version: string;
    }) => InferInsertModel<T>;
  };
  readonly encodeInstant: (millis: number) => unknown;
  readonly engineNowMillis: SQL;
}

export interface D1PhoneMapping {
  readonly d1: { readonly primary: true };
}

export interface PhonePersistenceServices {
  readonly phonePersistence: PhonePersistence["Service"];
  readonly phoneAdmission: PhoneAdmission["Service"];
  readonly phoneSignInTargets: PhoneSignInTargets["Service"];
}

/** Bundle phone storage, admission, and lookup with overridable crypto and hook defaults. */
export const phonePersistenceLayer = <E, R>(
  services: Effect.Effect<PhonePersistenceServices, E, R>,
) =>
  Layer.unwrap(
    Effect.map(services, (value) =>
      Layer.mergeAll(
        Layer.succeed(PhonePersistence, value.phonePersistence),
        Layer.succeed(PhoneAdmission, value.phoneAdmission),
        Layer.succeed(PhoneSignInTargets, value.phoneSignInTargets),
      ),
    ),
  ).pipe(Layer.provide([cryptoLayer, hooksLayer]));
