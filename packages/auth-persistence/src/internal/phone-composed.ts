import { PhoneSignInTargets, PhoneOtpUnavailable } from "@yielded/auth/PhoneOtp";
import { Effect } from "effect";
import { SqlClient } from "effect/sql/SqlClient";

import type { MappingInput } from "./configuration";
import type { AnyPhoneMapping } from "./models/phone-model";
import { requiredPhoneConstraints } from "./models/phone-model";
import type { AnyProofPersistenceMapping } from "./models/proof-model";
import type { NativeSqlTables } from "./native-sql-table";
import { makeNativePhoneServices } from "./phone-native";

/** Composed storage supplies sign-in; applications opt into provisioning with an explicit mapping. */
export const makeComposedPhoneTargets = Effect.fnUntraced(function* (
  tables: NativeSqlTables,
  storage: MappingInput,
  proofs: AnyProofPersistenceMapping,
  modules: ReadonlyArray<string>,
) {
  const sql = yield* SqlClient;
  const s = storage.subjects;
  const subject = tables(s.table);
  const identifier = tables(storage.tables.identifiers!);
  const credential = tables(storage.tables.credentials!);
  const targets = new Map<string, PhoneSignInTargets["Service"]>();

  for (const moduleId of modules) {
    const mapping: AnyPhoneMapping = {
      moduleId,
      policy: { maximumEvidenceAgeMillis: 300_000, requireImmediateInvalidation: true },
      constraints: requiredPhoneConstraints,
      proofs,
      subjectIds: { toNative: s.toNative, toSubject: s.toSubject },
      subject: {
        table: s.table,
        id: s.id,
        securityRevision: s.securityRevision,
        activeCondition: sql`${subject.column(s.status)} = ${subject.value(s.status, s.activeValue)}`,
        decodeRequirement: s.requirements,
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

    const services = yield* makeNativePhoneServices(tables, mapping);

    targets.set(moduleId, services.phoneSignInTargets);
  }

  return PhoneSignInTargets.of({
    lookup: (input) =>
      targets.get(input.moduleId)?.lookup(input) ?? Effect.fail(PhoneOtpUnavailable.make({})),
  });
});
