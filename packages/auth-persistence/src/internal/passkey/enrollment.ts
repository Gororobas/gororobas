/* oxlint-disable no-explicit-any -- existing mapped-row bridge; public adapters preserve table, ID, and Effect types. */

import {
  type PasskeyCeremony,
  PasskeyCeremony as Ceremony,
  type PasskeyManagementPersistence,
} from "@yielded/auth/Passkey";
import { Effect } from "effect";

import type { QueryOperations } from "../query-operations";
import type { makeTransactionKernel } from "../transaction-kernel";
import type { makePasskeyAdmissionKernel } from "./admission";
import type { makePasskeyCredentialsKernel } from "./credentials";
import type { makePasskeyFlowKernel } from "./flow";
import { CurrentPasskeyTransaction } from "./state";
import type { makePasskeyStateKernel } from "./state";
import type { WriteSubject, makePasskeyWriteStateKernel } from "./write-state";

type Issue = Parameters<PasskeyManagementPersistence["Service"]["issueEnrollment"]>[0];

type Complete = Parameters<PasskeyManagementPersistence["Service"]["completeEnrollment"]>[0];

export const makePasskeyEnrollmentKernel = (
  operations: QueryOperations,
  admission: Pick<
    ReturnType<typeof makePasskeyAdmissionKernel>,
    "lockAdmission" | "readCharges" | "guardChargeSet"
  >,
  credentials: Pick<
    ReturnType<typeof makePasskeyCredentialsKernel>,
    "readModule" | "readPolicyGuards"
  >,
  flow: Pick<
    ReturnType<typeof makePasskeyFlowKernel>,
    | "compatiblePolicy"
    | "exactClaim"
    | "issueAssertion"
    | "liveCondition"
    | "readFlow"
    | "terminalFlow"
  >,
  state: Pick<
    ReturnType<typeof makePasskeyStateKernel>,
    "equal" | "handleKey" | "invariant" | "sameRevision" | "credentialKey"
  >,
  writeState: Pick<
    ReturnType<typeof makePasskeyWriteStateKernel>,
    | "authorizeAction"
    | "credentialRows"
    | "currentSubject"
    | "enrollmentDigest"
    | "digest"
    | "insertCredential"
    | "managementPolicy"
    | "validRegistration"
  >,
  transactions: Pick<ReturnType<typeof makeTransactionKernel>, "both">,
) => {
  const { sql } = operations;
  const { lockAdmission, readCharges, guardChargeSet } = admission;
  const { readModule, readPolicyGuards } = credentials;

  const { compatiblePolicy, exactClaim, issueAssertion, liveCondition, readFlow, terminalFlow } =
    flow;

  const { equal, handleKey, sameRevision, credentialKey: credentialKeyFor } = state;
  const invariant: (value: unknown) => asserts value = state.invariant;

  const {
    authorizeAction,
    credentialRows,
    currentSubject,
    enrollmentDigest,
    digest,
    insertCredential,
    managementPolicy,
    validRegistration,
  } = writeState;

  const { both } = transactions;

  const enrollmentHandle = Effect.fn("passkey.enrollmentHandle")(function* (
    mapping: any,
    subject: WriteSubject,
    ceremony: PasskeyCeremony,
    create: boolean,
  ) {
    const owner = yield* CurrentPasskeyTransaction;

    invariant(ceremony.context._tag === "Enrollment");
    const table = mapping.read.handleOwnership;

    const where = equal(table.table, {
      [table.rpId]: ceremony.profile.rpId,
      [table.subjectId]: subject.nativeId,
    });

    const found = yield* owner.read(table.table, where, { limit: 1 });
    const row = found.rows[0];
    const hashed = handleKey(ceremony.profile.rpId, ceremony.context.userHandle);

    if (row !== undefined)
      return (
        table.isOwnedState(row[table.state]) &&
        row[table.handleKey] === hashed &&
        row[table.userHandle] === ceremony.context.userHandle &&
        mapping.read.subjectIds.equals(table.decodeSubjectId(row), subject.nativeId)
      );
    if (!create) return false;

    const absent = yield* owner.read(
      table.table,
      equal(table.table, { [table.handleKey]: hashed }),
      {
        limit: 1,
      },
    );

    if (absent.rows.length !== 0) return false;

    const inserted = yield* owner.insert(
      table.table,
      {
        ...mapping.write.handleOwnership.encodeInsert({
          subjectId: subject.nativeId,
          rpId: ceremony.profile.rpId,
          userHandle: ceremony.context.userHandle,
          marker: owner.marker,
        }),
        [table.handleKey]: hashed,
        [table.rpId]: ceremony.profile.rpId,
        [table.userHandle]: ceremony.context.userHandle,
        [table.subjectId]: subject.nativeId,
        [table.state]: mapping.write.handleOwnership.ownedState,
        [table.version]: owner.marker,
        [table.reservationId]: null,
      },
      { [table.handleKey]: hashed },
    );

    found.rows = inserted.rows;
    absent.rows = inserted.rows;

    return true;
  });

  const capCondition = (mapping: any, subject: WriteSubject, maximum: number, addition: number) => {
    const table = mapping.read.credential;

    return sql`(select count(*) from ${table.table} where ${both(equal(table.table, { [table.subjectId]: subject.nativeId }), table.activeCondition)}) + ${addition} <= ${maximum}`;
  };

  const issueEnrollment = Effect.fn("passkey.issueEnrollment")(function* (
    mapping: any,
    input: Issue,
  ) {
    const owner = yield* CurrentPasskeyTransaction;
    const ceremony = input.ceremony;

    if (
      ceremony.context._tag !== "Enrollment" ||
      ceremony.purpose !== "enrollment" ||
      ceremony.moduleId !== mapping.moduleId
    )
      return { _tag: "Rejected" } as const;
    const current = yield* readModule(mapping);

    if (current === undefined || !compatiblePolicy(ceremony, input.policy, current))
      return { _tag: "Rejected" } as const;
    yield* lockAdmission(mapping);
    const subject = yield* currentSubject(mapping, ceremony.context.revision.subjectId);

    if (subject === undefined || !sameRevision(subject.revision, ceremony.context.revision))
      return { _tag: "Rejected" } as const;
    yield* readPolicyGuards(mapping);
    const policy = managementPolicy(mapping, subject);
    const maximum = Math.min(policy.maximumCredentials, input.management.maximumCredentials);
    const rows = yield* credentialRows(mapping, subject, ceremony.profile.rpId);
    const ids = rows.map((row) => row[mapping.read.credential.protocolCredentialId]);

    if (
      ids.length !== ceremony.allowedCredentials.length ||
      !ids.every((id) => ceremony.allowedCredentials.some((item) => item.id === id)) ||
      !(yield* owner.check(capCondition(mapping, subject, maximum, 1)))
    )
      return { _tag: "Rejected" } as const;
    if (
      !(yield* authorizeAction(
        mapping,
        subject,
        input.authorization,
        {
          action: "enroll-begin",
          commandId: ceremony.commandId,
          flowId: ceremony.flowId,
          bindingDigest: enrollmentDigest(ceremony),
          revision: ceremony.context.revision,
        },
        {
          ...policy,
          maximumEvidenceAgeMillis: Math.min(
            policy.maximumEvidenceAgeMillis,
            input.management.maximumEvidenceAgeMillis,
          ),
        },
      ))
    )
      return { _tag: "Rejected" } as const;
    invariant(
      digest(Ceremony.fields.context, ceremony.context) ===
        digest(Ceremony.fields.context, {
          ...ceremony.context,
          authorization: input.authorization,
        }),
    );
    const issued = yield* issueAssertion(mapping, ceremony, input.policy);

    if (issued._tag !== "Issued") return issued;
    invariant(yield* enrollmentHandle(mapping, subject, ceremony, true));
    owner.postconditions.push(capCondition(mapping, subject, maximum, 1));

    return issued;
  });

  const completeEnrollment = Effect.fn("passkey.completeEnrollment")(function* (
    mapping: any,
    input: Complete,
  ) {
    const owner = yield* CurrentPasskeyTransaction;
    const ceremony = input.claim.ceremony;

    if (
      ceremony.context._tag !== "Enrollment" ||
      ceremony.purpose !== "enrollment" ||
      ceremony.moduleId !== mapping.moduleId
    )
      return { _tag: "Rejected" } as const;
    const current = yield* readModule(mapping);

    if (current === undefined) return { _tag: "Rejected" } as const;
    yield* lockAdmission(mapping);
    const subject = yield* currentSubject(mapping, ceremony.context.revision.subjectId);

    yield* readPolicyGuards(mapping);
    const read = yield* readFlow(mapping, ceremony.flowId);

    if (read === undefined || !exactClaim(read, input.claim)) return { _tag: "Rejected" } as const;

    const reject = Effect.gen(function* () {
      yield* terminalFlow(mapping, read, "Rejected");

      return { _tag: "Rejected" } as const;
    });

    if (
      subject === undefined ||
      !sameRevision(subject.revision, ceremony.context.revision) ||
      !compatiblePolicy(ceremony, read.policy, current) ||
      !validRegistration(ceremony, input.verified) ||
      !(yield* owner.check(liveCondition(mapping, ceremony, input.claim)))
    )
      return yield* reject;
    const policy = managementPolicy(mapping, subject);
    const maximum = Math.min(policy.maximumCredentials, input.management.maximumCredentials);

    if (
      !(yield* owner.check(capCondition(mapping, subject, maximum, 1))) ||
      !(yield* enrollmentHandle(mapping, subject, ceremony, false))
    )
      return yield* reject;
    if (
      !(yield* authorizeAction(
        mapping,
        subject,
        input.authorization,
        {
          action: "enroll-complete",
          commandId: ceremony.commandId,
          flowId: ceremony.flowId,
          bindingDigest: digest(Ceremony, ceremony),
          revision: ceremony.context.revision,
        },
        {
          ...policy,
          maximumEvidenceAgeMillis: Math.min(
            policy.maximumEvidenceAgeMillis,
            input.management.maximumEvidenceAgeMillis,
          ),
        },
        ceremony.context.authorization.requirement,
      ))
    )
      return yield* reject;
    const tuple = mapping.read.credentialOwnership;
    // Credential ownership is RP-global, including retained registration custody.
    const key = credentialKeyFor(ceremony.profile.rpId, input.verified.protocolCredentialId);

    if (
      (yield* owner.read(tuple.table, equal(tuple.table, { [tuple.credentialKey]: key }), {
        limit: 1,
        observe: false,
      })).rows.length !== 0
    )
      return yield* reject;
    yield* readCharges(mapping, ceremony, read.policy, subject.subjectId);
    yield* guardChargeSet(mapping, ceremony, subject.subjectId);

    const safe = yield* insertCredential(
      mapping,
      subject,
      ceremony,
      input.verified,
      yield* owner.now(mapping.clock),
    );

    yield* terminalFlow(mapping, read, "Verified");
    owner.postconditions.push(
      liveCondition(mapping, ceremony, input.claim),
      capCondition(mapping, subject, maximum, 0),
    );

    return { _tag: "Enrolled", credential: safe } as const;
  });

  return { enrollmentHandle, issueEnrollment, completeEnrollment };
};
