import { PhonePersistence, PhoneSignInTargets, PhoneOtpUnavailable } from "@yielded/auth/PhoneOtp";
import type * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as SqlClient from "effect/sql/SqlClient";

import {
  PersistenceConfigurationError,
  type MappingInput,
  type PhoneFeature,
  type PhoneSubjectProvisioning,
} from "./configuration";
import type { AnyPhoneMapping } from "./models/phone-model";
import { requiredPhoneConstraints } from "./models/phone-model";
import type { AnyProofPersistenceMapping } from "./models/proof-model";
import type { NativeSqlTables } from "./native-sql-table";
import { makeNativePhoneServices, PhoneRegistrationValues } from "./phone-native";

/** Reuse the phone commit owner with application-supplied subject values. */
export const makeComposedPhoneServices = Effect.fnUntraced(function* <R>(
  tables: NativeSqlTables,
  storage: MappingInput,
  proofs: AnyProofPersistenceMapping,
  modules: ReadonlyArray<{ readonly name: string; readonly feature: PhoneFeature }>,
  provisioning: Context.Key<R, object>,
) {
  const sql = yield* SqlClient.SqlClient;
  const s = storage.subjects;
  const subject = tables(s.table);
  const identifier = tables(storage.tables.identifiers!);
  const credential = tables(storage.tables.credentials!);
  const targets = new Map<string, PhoneSignInTargets["Service"]>();
  const lifecycles = new Map<string, PhonePersistence["Service"]>();

  for (const { name, feature } of modules) {
    const { moduleId } = feature;
    let values: Option.Option<PhoneSubjectProvisioning> = Option.none();

    if (feature.lifecycle) {
      if (feature.lifecyclePolicy === undefined)
        return yield* PersistenceConfigurationError.make({
          reason: `Missing phone lifecycle policy for ${name}`,
        });
      // The heterogeneous service map is narrowed to the configured phone strategy.
      const creators = (yield* provisioning) as Readonly<Record<string, PhoneSubjectProvisioning>>;
      const creator = creators[name];

      if (creator?.values === undefined)
        return yield* PersistenceConfigurationError.make({
          reason: `Phone subject provisioning for ${name} requires { values }`,
        });

      values = Option.some(creator);
    }

    const mapping: AnyPhoneMapping = {
      moduleId,
      policy: feature.lifecyclePolicy ?? {
        maximumEvidenceAgeMillis: 300_000,
        requireImmediateInvalidation: true,
      },
      constraints: requiredPhoneConstraints,
      proofs,
      subjectIds: { toNative: s.toNative, toSubject: s.toSubject },
      subject: {
        table: s.table,
        id: s.id,
        securityRevision: s.securityRevision,
        activeCondition: sql`${subject.column(s.status)} = ${subject.value(s.status, s.activeValue)}`,
        decodeRequirement: s.requirements,
        decodeActionRequirement: s.actionRequirements,
      },
      identifier: {
        table: storage.tables.identifiers!,
        moduleId: "moduleId",
        credentialId: "credentialId",
        namespace: "namespace",
        value: "value",
        subjectId: "subjectId",
        revision: "revision",
        verifiedAt: "verifiedAt",
        status: "active",
        activeCondition: sql`${identifier.column("active")} = ${identifier.value("active", true)}`,
        encodeStatus: (value) => value,
        encodeInsert: (row) => ({
          moduleId: row.moduleId,
          credentialId: row.credentialId,
          namespace: "phone",
          value: row.phoneNumber,
          subjectId: row.subjectId,
          revision: row.revision,
          verifiedAt: storage.encodeInstant(row.verifiedAtMillis),
          active: row.active,
        }),
      },
      credential: {
        table: storage.tables.credentials!,
        id: "credentialId",
        subjectId: "subjectId",
        revision: "revision",
        status: "active",
        activeCondition: sql`${credential.column("active")} = ${credential.value("active", true)}`,
        encodeStatus: (value) => value,
        encodeInsert: (row) => row,
      },
      encodeInstant: storage.encodeInstant,
      engineNowMillis: proofs.clock.engineNowMillis,
    };

    const services = yield* makeNativePhoneServices(tables, mapping).pipe(
      Effect.provideService(PhoneRegistrationValues, values),
    );

    targets.set(moduleId, services.phoneSignInTargets);
    if (feature.lifecycle) lifecycles.set(moduleId, services.phonePersistence);
  }

  return {
    phoneSignInTargets: PhoneSignInTargets.of({
      lookup: (input) =>
        targets.get(input.moduleId)?.lookup(input) ?? Effect.fail(PhoneOtpUnavailable.make({})),
    }),
    phonePersistence: PhonePersistence.of({
      target: (input) =>
        lifecycles.get(input.moduleId)?.target(input) ?? Effect.fail(PhoneOtpUnavailable.make({})),
      mutate: (input, prepare) =>
        lifecycles.get(input.moduleId)?.mutate(input, prepare) ??
        Effect.fail(PhoneOtpUnavailable.make({})),
    }),
  };
});
