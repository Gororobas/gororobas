import { digest, randomId } from "@yielded/auth-crypto";
import {
  PhoneCustody,
  PhoneCommandId,
  PhoneLifecycleAction,
  PhoneLifecycleTarget,
  PhoneLifecyclePolicy,
  type PhoneMutationDecision,
  PhoneOtpUnavailable,
  PhoneCredentialSnapshot,
  type PhoneMutation,
} from "@yielded/auth/PhoneOtp";
import type { SubjectId } from "@yielded/auth/Schema";
import { AuthenticationRequirement, SecurityRevision } from "@yielded/auth/Sessions";
import { Context, Effect, Option, Schema } from "effect";

/* oxlint-disable no-explicit-any -- existing storage kernels erase foreign table shapes; domain errors remain typed. */
import type { SqlExpression as SQL } from "./query-operations";
import type { QueryOperations, SqlFragment, SqlColumn } from "./query-operations";
import { type TransactionOwner, type makeTransactionKernel } from "./transaction-kernel";

export class CurrentPhoneTransaction extends Context.Service<
  CurrentPhoneTransaction,
  TransactionOwner<PhoneOtpUnavailable>
>()("effect-auth/drizzle/CurrentPhoneTransaction") {}

export const makePhoneKernel = <
  Fragment extends SqlFragment = SqlFragment,
  Column extends SqlColumn = SqlColumn,
>(
  operations: QueryOperations<Fragment, Column>,
  transactions: Pick<ReturnType<typeof makeTransactionKernel>, "both" | "makeTransactionRows">,
) => {
  const { sql } = operations;
  const { both, makeTransactionRows } = transactions;
  const unavailable = () => PhoneOtpUnavailable.make({});

  const invariant: (value: unknown) => asserts value = (value) => {
    if (!value) throw unavailable();
  };

  const { equal, copiedRow, col } = makeTransactionRows(unavailable);

  const AdmissionReceipt = Schema.Struct({
    fingerprint: Schema.NonEmptyString,
    network: Schema.NonEmptyString,
    accepted: Schema.Boolean,
    expiresAtMillis: Schema.Natural,
  });

  const AdmissionCounter = Schema.Struct({ window: Schema.Natural, count: Schema.Natural });

  const CommandRecord = Schema.Struct({ commandId: PhoneCommandId, action: PhoneLifecycleAction });

  const State = Schema.Union([PhoneCustody, AdmissionReceipt, AdmissionCounter, CommandRecord]);

  const storageCodec = Schema.fromJsonString(
    Schema.Struct({ moduleId: Schema.NonEmptyString, record: State }),
  );

  const readStored = <A extends Schema.Top>(
    mapping: any,
    payload: string,
    schema: A,
  ): A["Type"] => {
    const stored = Schema.decodeSync(storageCodec)(payload);

    invariant(stored.moduleId === mapping.moduleId && Schema.is(schema)(stored.record));

    return stored.record;
  };

  const stringTuple = Schema.fromJsonString(Schema.Array(Schema.String));

  const scope = (moduleId: string, kind: string, key: string) =>
    digest(Schema.encodeSync(stringTuple)(["effect-auth/phone/v1", moduleId, kind, key]));

  const rejected: PhoneMutationDecision = { _tag: "Rejected" };

  const stateRead = Effect.fn("PhoneNative.stateRead")(function* (mapping: any, key: string) {
    const owner = yield* CurrentPhoneTransaction;

    return yield* owner.read(
      mapping.state.table,
      equal(mapping.state.table, { [mapping.state.scope]: key }),
      { limit: 1 },
    );
  });

  const stateWrite = Effect.fn("PhoneNative.stateWrite")(function* (
    mapping: any,
    key: string,
    value: typeof State.Type,
    observed: any,
  ) {
    const owner = yield* CurrentPhoneTransaction;

    const values = {
      [mapping.state.state]: Schema.encodeSync(storageCodec)({
        moduleId: mapping.moduleId,
        record: value,
      }),
      [mapping.state.version]: randomId(),
    };

    if (observed.rows.length === 0) {
      const inserted = yield* owner.insert(
        mapping.state.table,
        {
          ...copiedRow(
            mapping.state.encodeInsert({
              scope: key,
              state: values[mapping.state.state],
              version: values[mapping.state.version],
            }),
          ),
          [mapping.state.scope]: key,
          ...values,
        },
        { [mapping.state.scope]: key },
      );

      observed.rows = inserted.rows;
    } else yield* owner.update(mapping.state.table, { [mapping.state.scope]: key }, values);
  });

  const custodyRead = Effect.fn("PhoneNative.custodyRead")(function* (
    mapping: any,
    phoneNumber: string,
  ) {
    const key = scope(mapping.moduleId, "custody", phoneNumber),
      observation = yield* stateRead(mapping, key);

    const custody =
      observation.rows.length === 0
        ? null
        : readStored(mapping, observation.rows[0]![mapping.state.state], PhoneCustody);

    invariant(custody === null || custody.phoneNumber === phoneNumber);

    return { key, observation, custody };
  });

  const capturePhone = Effect.fn("PhoneNative.capture")(function* (
    mapping: any,
    input: {
      readonly action: "register" | "verify" | "change";
      readonly phoneNumber: any;
      readonly subjectId?: SubjectId;
      readonly sourcePhoneNumber?: any;
    },
  ) {
    const owner = yield* CurrentPhoneTransaction;
    const destination = yield* custodyRead(mapping, input.phoneNumber);

    const source =
      input.sourcePhoneNumber === undefined
        ? null
        : yield* custodyRead(mapping, input.sourcePhoneNumber);

    const id = input.subjectId ?? destination.custody?.subjectId;

    const subject =
      id === undefined
        ? null
        : yield* owner.read(
            mapping.subject.table,
            equal(mapping.subject.table, { [mapping.subject.id]: mapping.subjectIds.toNative(id) }),
            { limit: 1 },
          );

    const row = subject?.rows[0];

    const active =
      row !== undefined &&
      (yield* owner.check(
        sql`exists(select 1 from ${mapping.subject.table} where ${both(owner.exact(mapping.subject.table, row), mapping.subject.activeCondition)})`,
      ));

    const targetIdentifier = yield* owner.read(
      mapping.identifier.table,
      equal(mapping.identifier.table, {
        [mapping.identifier.namespace]: "phone",
        [mapping.identifier.value]: input.phoneNumber,
      }),
      { limit: 1 },
    );

    let eligible =
      input.action === "register"
        ? destination.custody === null && targetIdentifier.rows.length === 0
        : active &&
          input.subjectId === id &&
          ((destination.custody === null && targetIdentifier.rows.length === 0) ||
            (destination.custody?.subjectId === id && destination.custody?.state === "unverified"));

    if (input.action === "change")
      eligible =
        eligible &&
        input.sourcePhoneNumber !== input.phoneNumber &&
        source?.custody?.subjectId === id &&
        source?.custody?.state === "verified";
    const credentials = [];

    for (const custody of [destination.custody, source?.custody])
      if (
        custody !== null &&
        custody !== undefined &&
        custody.state === "verified" &&
        custody.subjectId === id
      ) {
        const c = mapping.credential;

        const found = yield* owner.read(
          c.table,
          equal(c.table, {
            [c.id]: custody.credentialId,
            [c.subjectId]: mapping.subjectIds.toNative(id),
          }),
          { limit: 1 },
        );

        const cr = found.rows[0];

        if (
          cr === undefined ||
          cr[c.revision] !== custody.credentialRevision ||
          !(yield* owner.check(
            sql`exists(select 1 from ${c.table} where ${both(owner.exact(c.table, cr), c.activeCondition)})`,
          ))
        )
          eligible = false;
        else
          credentials.push({
            credentialId: custody.credentialId,
            revision: custody.credentialRevision,
          });
      }

    const target: PhoneLifecycleTarget = {
      phoneNumber: input.phoneNumber,
      custody: destination.custody,
      source: source?.custody ?? null,
      revision: active
        ? {
            subjectId: id!,
            securityRevision: SecurityRevision.make(row![mapping.subject.securityRevision]),
            credentials,
          }
        : null,
      eligible,
    };

    return { target, destination, source, subject, subjectRow: row, targetIdentifier };
  });

  const lookupPhone = Effect.fn("PhoneNative.lookup")(function* (
    mapping: any,
    input: { readonly moduleId: string; readonly phoneNumber: any },
  ) {
    invariant(input.moduleId === mapping.moduleId);

    const captured = yield* capturePhone(mapping, {
      action: "verify",
      phoneNumber: input.phoneNumber,
    });

    const { custody, revision } = captured.target;

    if (
      custody === null ||
      custody.state !== "verified" ||
      custody.verifiedAtMillis === null ||
      revision === null ||
      !revision.credentials.some((c) => c.credentialId === custody.credentialId)
    )
      return Option.none();

    const owner = yield* CurrentPhoneTransaction,
      i = mapping.identifier,
      row = captured.targetIdentifier.rows[0];

    if (
      row === undefined ||
      row[i.revision] !== custody.custodyRevision ||
      !(yield* owner.check(
        sql`exists(select 1 from ${i.table} where ${both(owner.exact(i.table, row), equal(i.table, { [i.subjectId]: mapping.subjectIds.toNative(custody.subjectId) }), i.activeCondition)})`,
      ))
    )
      return Option.none();

    return Option.some(
      Schema.decodeSync(PhoneCredentialSnapshot)({
        moduleId: mapping.moduleId,
        phoneNumber: input.phoneNumber,
        custodyRevision: custody.custodyRevision,
        verifiedAtMillis: custody.verifiedAtMillis,
        credentialId: custody.credentialId,
        credentialRevision: custody.credentialRevision,
        revision,
      }),
    );
  });

  const admitPhone = Effect.fn("PhoneNative.admit")(function* (
    mapping: any,
    input: {
      readonly moduleId: string;
      readonly action: "request" | "attempt";
      readonly requestId: string;
      readonly fingerprint: string;
      readonly networkKey: string;
      readonly replayLifetimeMillis: number;
    },
  ) {
    invariant(
      input.moduleId === mapping.moduleId &&
        Number.isSafeInteger(input.replayLifetimeMillis) &&
        input.replayLifetimeMillis >= 0 &&
        input.networkKey.length > 0 &&
        input.networkKey.length <= 1024 &&
        input.requestId.length > 0 &&
        input.requestId.length <= 256,
    );

    const owner = yield* CurrentPhoneTransaction,
      now = yield* owner.now(mapping),
      policy = mapping.admission;

    const key = scope(mapping.moduleId, "admission", input.action + "/" + input.requestId),
      receipt = yield* stateRead(mapping, key);

    if (receipt.rows.length !== 0) {
      const saved = readStored(mapping, receipt.rows[0]![mapping.state.state], AdmissionReceipt);

      if (saved.expiresAtMillis > now)
        owner.postconditions.push(sql`${mapping.engineNowMillis} < ${saved.expiresAtMillis}`);

      return (
        saved.fingerprint === input.fingerprint &&
        saved.network === digest(input.networkKey) &&
        saved.accepted === true &&
        saved.expiresAtMillis > now
      );
    }

    const window = Math.floor(now / policy.windowMillis),
      entries = [
        {
          key: scope(mapping.moduleId, "network", input.action + "/" + digest(input.networkKey)),
          limit: input.action === "request" ? policy.networkRequests : policy.networkAttempts,
        },
        ...(input.action === "request"
          ? [{ key: scope(mapping.moduleId, "messages", "global"), limit: policy.maximumMessages }]
          : []),
      ].sort((a, b) => a.key.localeCompare(b.key));

    const updates = [];
    let accepted = true;

    for (const entry of entries) {
      const observed = yield* stateRead(mapping, entry.key),
        previous =
          observed.rows.length === 0
            ? undefined
            : readStored(mapping, observed.rows[0]![mapping.state.state], AdmissionCounter);

      const count = previous?.window === window ? previous.count : 0;

      if (count >= entry.limit) accepted = false;
      updates.push({ ...entry, observed, count });
    }
    if (accepted)
      for (const update of updates)
        yield* stateWrite(
          mapping,
          update.key,
          { window, count: update.count + 1 },
          update.observed,
        );
    yield* stateWrite(
      mapping,
      key,
      {
        fingerprint: input.fingerprint,
        network: digest(input.networkKey),
        accepted,
        expiresAtMillis: now + Math.min(policy.requestRetentionMillis, input.replayLifetimeMillis),
      },
      receipt,
    );
    owner.postconditions.push(
      sql`${mapping.engineNowMillis} >= ${window * policy.windowMillis} and ${mapping.engineNowMillis} < ${(window + 1) * policy.windowMillis}`,
    );

    return accepted;
  });

  const preparePhoneMutation = Effect.fn("PhoneNative.prepareMutation")(function* (
    mapping: any,
    input: PhoneMutation,
  ) {
    const owner = yield* CurrentPhoneTransaction;

    invariant(
      input.moduleId === mapping.moduleId &&
        Schema.encodeSync(Schema.fromJsonString(PhoneLifecyclePolicy))(input.policy) ===
          Schema.encodeSync(Schema.fromJsonString(PhoneLifecyclePolicy))(mapping.policy),
    );

    const captured = yield* capturePhone(mapping, {
      action: input.action,
      phoneNumber: input.target.phoneNumber,
      ...(input.target.revision === null ? {} : { subjectId: input.target.revision.subjectId }),
      ...(input.target.source === null
        ? {}
        : { sourcePhoneNumber: input.target.source.phoneNumber }),
    });

    if (
      !captured.target.eligible ||
      Schema.encodeSync(Schema.fromJsonString(PhoneLifecycleTarget))(captured.target) !==
        Schema.encodeSync(Schema.fromJsonString(PhoneLifecycleTarget))(input.target)
    )
      return { decision: rejected };
    const binding = input.completion.input.binding;

    if (
      input.completion.input.moduleId !== `${mapping.moduleId}/lifecycle` ||
      input.completion.input.purpose !== "phone-lifecycle" ||
      binding.identifier.namespace !== "phone" ||
      binding.identifier.value !== input.target.phoneNumber
    )
      return { decision: rejected };
    if (
      input.action === "register"
        ? binding._tag !== "Identifier"
        : binding._tag === "Identifier" ||
          binding.revision.subjectId !== input.target.revision?.subjectId ||
          binding.revision.securityRevision !== input.target.revision?.securityRevision
    )
      return { decision: rejected };
    if (
      (input.action === "verify" && binding._tag !== "Subject") ||
      (input.action === "change" && binding._tag !== "IdentifierChange")
    )
      return { decision: rejected };

    const commandKey = scope(mapping.moduleId, "command", input.commandId),
      command = yield* stateRead(mapping, commandKey);

    if (command.rows.length !== 0) return { decision: rejected };

    const now = yield* owner.now(mapping),
      guards: SQL[] = [];

    const credentialGuards: { id: string; condition: SQL }[] = [];

    if (input.action !== "register") {
      const authorization = input.authorization;

      if (authorization === undefined) return { decision: rejected };
      const { challenge, evidence } = authorization;
      const revision = captured.target.revision!;

      if (
        challenge.moduleId !== mapping.moduleId ||
        challenge.action !== input.action ||
        challenge.commandId !== input.commandId ||
        challenge.phoneNumber !== input.target.phoneNumber ||
        challenge.sourcePhoneNumber !== input.target.source?.phoneNumber ||
        challenge.flowId !== binding.flowId ||
        challenge.bindingDigest !== binding.contextDigest ||
        challenge.flowId !== evidence.flowId ||
        challenge.bindingDigest !== evidence.bindingDigest ||
        challenge.revision.subjectId !== revision.subjectId ||
        challenge.revision.securityRevision !== revision.securityRevision ||
        evidence.revision.subjectId !== revision.subjectId ||
        evidence.revision.securityRevision !== revision.securityRevision
      )
        return { decision: rejected };
      const c = mapping.credential;

      for (const item of [...evidence.revision.credentials].sort((a, b) =>
        a.credentialId.localeCompare(b.credentialId),
      )) {
        const found = yield* owner.read(
            c.table,
            equal(c.table, {
              [c.id]: item.credentialId,
              [c.subjectId]: mapping.subjectIds.toNative(revision.subjectId),
            }),
            { limit: 1 },
          ),
          row = found.rows[0];

        if (row === undefined || row[c.revision] !== item.revision) return { decision: rejected };
        const condition = sql`exists(select 1 from ${c.table} where ${both(owner.exact(c.table, row), c.activeCondition)})`;

        if (!(yield* owner.check(condition))) return { decision: rejected };
        credentialGuards.push({ id: item.credentialId, condition });
      }
      const proofs = evidence.proofs;

      if (
        proofs.length === 0 ||
        proofs.some(
          (p) => !evidence.revision.credentials.some((c) => c.credentialId === p.credentialId),
        )
      )
        return { decision: rejected };

      const requirements = [
        authorization.requirement,
        authorization.actionRequirement,
        ...(mapping.subject.decodeActionRequirement === undefined
          ? []
          : [
              Schema.decodeSync(AuthenticationRequirement)(
                mapping.subject.decodeActionRequirement(
                  copiedRow(captured.subjectRow!),
                  input.action,
                ),
              ),
            ]),
        Schema.decodeSync(AuthenticationRequirement)(
          mapping.subject.decodeRequirement(copiedRow(captured.subjectRow!)),
        ),
      ];

      const age = Math.min(
          input.policy.maximumEvidenceAgeMillis,
          ...requirements.map((r) => r.maximumAgeMillis),
        ),
        factors = new Set(proofs.flatMap((p) => p.factors)),
        credentials = new Set(proofs.map((p) => p.credentialId));

      for (const requirement of requirements)
        if (
          !requirement.alternatives.some(
            (a) =>
              a.factors.every((f) => factors.has(f)) &&
              credentials.size >= a.minimumCredentials &&
              proofs.some(
                (p) =>
                  (!a.userVerified || p.userVerified) &&
                  (!a.phishingResistant || p.phishingResistant),
              ),
          )
        )
          return { decision: rejected };
      for (const proof of proofs) {
        const at = proof.verifiedAt.epochMilliseconds;

        if (at > now || now - at >= age) return { decision: rejected };
        guards.push(
          sql`${mapping.engineNowMillis} >= ${at} and ${mapping.engineNowMillis} < ${at + age}`,
        );
      }
    }

    const subjectId =
        input.action === "register"
          ? mapping.subjectIds.toSubject(mapping.subjectIds.allocate())
          : captured.target.revision!.subjectId,
      nativeId = mapping.subjectIds.toNative(subjectId),
      securityRevision = SecurityRevision.make(randomId()),
      credentialRevision = SecurityRevision.make(randomId()),
      custodyRevision = SecurityRevision.make(randomId()),
      credentialId = captured.target.custody?.credentialId ?? randomId();

    invariant(mapping.subjectIds.toSubject(nativeId) === subjectId);

    const custody: PhoneCustody = {
      phoneNumber: input.target.phoneNumber,
      subjectId,
      credentialId,
      credentialRevision,
      custodyRevision,
      verifiedAtMillis: now,
      state: "verified",
    };

    const decision: PhoneMutationDecision = {
      _tag: "Accepted",
      credential: {
        moduleId: mapping.moduleId,
        phoneNumber: input.target.phoneNumber,
        custodyRevision,
        verifiedAtMillis: now,
        credentialId,
        credentialRevision,
        revision: {
          subjectId,
          securityRevision,
          credentials: [{ credentialId, revision: credentialRevision }],
        },
      },
    };

    const mutate = Effect.gen(function* () {
      if (input.action === "register")
        yield* owner.insert(
          mapping.subject.table,
          {
            ...copiedRow(
              mapping.subject.encodeInsert({
                id: nativeId,
                securityRevision,
                phoneNumber: input.target.phoneNumber,
              }),
            ),
            [mapping.subject.id]: nativeId,
            [mapping.subject.securityRevision]: securityRevision,
          },
          { [mapping.subject.id]: nativeId },
        );
      else
        yield* owner.update(
          mapping.subject.table,
          { [mapping.subject.id]: nativeId },
          { [mapping.subject.securityRevision]: securityRevision },
        );

      const i = mapping.identifier,
        c = mapping.credential;

      if (captured.source?.custody) {
        const old = captured.source.custody;

        const ir = yield* owner.read(
          i.table,
          equal(i.table, {
            [i.namespace]: "phone",
            [i.value]: old.phoneNumber,
            [i.subjectId]: nativeId,
          }),
          { limit: 1 },
        );

        invariant(ir.rows.length === 1 && ir.rows[0]![i.revision] === old.custodyRevision);
        invariant(
          yield* owner.check(
            sql`exists(select 1 from ${i.table} where ${both(owner.exact(i.table, ir.rows[0]!), i.activeCondition)})`,
          ),
        );
        yield* owner.update(
          i.table,
          { [i.namespace]: "phone", [i.value]: old.phoneNumber },
          { [i.status]: i.encodeStatus(false), [i.revision]: randomId() },
        );
        yield* owner.update(
          c.table,
          { [c.id]: old.credentialId, [c.subjectId]: nativeId },
          { [c.status]: c.encodeStatus(false), [c.revision]: randomId() },
        );
        yield* stateWrite(
          mapping,
          captured.source.key,
          {
            ...old,
            state: "retired",
            custodyRevision: SecurityRevision.make(randomId()),
            credentialRevision: SecurityRevision.make(randomId()),
          },
          captured.source.observation,
        );
      }
      if (captured.targetIdentifier.rows.length === 0) {
        const inserted = yield* owner.insert(
          i.table,
          {
            ...copiedRow(
              i.encodeInsert({
                phoneNumber: input.target.phoneNumber,
                subjectId: nativeId,
                revision: custodyRevision,
                verifiedAtMillis: now,
                active: true,
              }),
            ),
            [i.namespace]: "phone",
            [i.value]: input.target.phoneNumber,
            [i.subjectId]: nativeId,
            [i.revision]: custodyRevision,
            [i.verifiedAt]: mapping.encodeInstant(now),
            [i.status]: i.encodeStatus(true),
          },
          { [i.namespace]: "phone", [i.value]: input.target.phoneNumber },
        );

        captured.targetIdentifier.rows = inserted.rows;
      } else {
        const row = captured.targetIdentifier.rows[0]!;

        invariant(
          yield* owner.check(
            sql`exists(select 1 from ${i.table} where ${both(owner.exact(i.table, row), equal(i.table, { [i.subjectId]: nativeId }))})`,
          ),
        );
        yield* owner.update(
          i.table,
          { [i.namespace]: "phone", [i.value]: input.target.phoneNumber },
          {
            [i.revision]: custodyRevision,
            [i.verifiedAt]: mapping.encodeInstant(now),
            [i.status]: i.encodeStatus(true),
          },
        );
      }

      const credential = yield* owner.read(c.table, equal(c.table, { [c.id]: credentialId }), {
        limit: 1,
      });

      if (credential.rows.length === 0) {
        const inserted = yield* owner.insert(
          c.table,
          {
            ...copiedRow(
              c.encodeInsert({
                credentialId,
                subjectId: nativeId,
                revision: credentialRevision,
                active: true,
              }),
            ),
            [c.id]: credentialId,
            [c.subjectId]: nativeId,
            [c.revision]: credentialRevision,
            [c.status]: c.encodeStatus(true),
          },
          { [c.id]: credentialId },
        );

        credential.rows = inserted.rows;
      } else {
        invariant(
          yield* owner.check(
            sql`exists(select 1 from ${c.table} where ${both(owner.exact(c.table, credential.rows[0]!), equal(c.table, { [c.subjectId]: nativeId }))})`,
          ),
        );
        yield* owner.update(
          c.table,
          { [c.id]: credentialId },
          { [c.revision]: credentialRevision, [c.status]: c.encodeStatus(true) },
        );
      }
      yield* stateWrite(
        mapping,
        captured.destination.key,
        custody,
        captured.destination.observation,
      );
      yield* stateWrite(
        mapping,
        commandKey,
        { commandId: input.commandId, action: input.action },
        command,
      );
      owner.postconditions.push(
        ...guards,
        sql`exists(select 1 from ${i.table} where ${both(equal(i.table, { [i.namespace]: "phone", [i.value]: input.target.phoneNumber, [i.subjectId]: nativeId, [i.revision]: custodyRevision, [i.verifiedAt]: mapping.encodeInstant(now) }), i.activeCondition)})`,
        ...(captured.source?.custody === null || captured.source?.custody === undefined
          ? []
          : [
              sql`not exists(select 1 from ${i.table} where ${both(equal(i.table, { [i.namespace]: "phone", [i.value]: captured.source.custody.phoneNumber }), i.activeCondition)})`,
              sql`not exists(select 1 from ${c.table} where ${both(equal(c.table, { [c.id]: captured.source.custody.credentialId }), c.activeCondition)})`,
            ]),
        ...credentialGuards
          .filter((g) => g.id !== captured.source?.custody?.credentialId && g.id !== credentialId)
          .map((g) => g.condition),
        sql`exists(select 1 from ${c.table} where ${both(equal(c.table, { [c.id]: credentialId, [c.subjectId]: nativeId, [c.revision]: credentialRevision }), c.activeCondition)})`,
        sql`exists(select 1 from ${mapping.subject.table} where ${both(equal(mapping.subject.table, { [mapping.subject.id]: nativeId, [mapping.subject.securityRevision]: securityRevision }), mapping.subject.activeCondition)})`,
      );

      return true;
    });

    return {
      decision,
      mutate,
      appliedCondition: sql`exists(select 1 from ${mapping.state.table} where ${equal(mapping.state.table, { [mapping.state.scope]: commandKey })})`,
    };
  });

  /** Bounded cursor cleanup never removes custody or semantic-command tombstones. */
  const cleanupPhoneAdmission = Effect.fn("PhoneNative.cleanupAdmission")(function* (
    mapping: any,
    input: { readonly moduleId: string; readonly limit: number; readonly after?: string },
  ) {
    invariant(
      input.moduleId === mapping.moduleId &&
        Number.isSafeInteger(input.limit) &&
        input.limit >= 1 &&
        input.limit <= 1000,
    );

    const owner = yield* CurrentPhoneTransaction,
      now = yield* owner.now(mapping),
      state = mapping.state;

    // The page predicate matches every later row. Observing it would require the
    // page to be the whole table, so cleanup could not advance. Discover without
    // an observation, then guard each candidate by its scope.
    const page = yield* owner.read(
      state.table,
      input.after === undefined ? sql`1=1` : sql`${col(state.table, state.scope)} > ${input.after}`,
      {
        limit: input.limit,
        takeOnly: true,
        observe: false,
        orderBy: col(state.table, state.scope),
      },
    );

    let deleted = 0;
    const rows = [...page.rows];

    for (const candidate of rows) {
      const current = yield* owner.read(
        state.table,
        equal(state.table, { [state.scope]: candidate[state.scope] }),
        { limit: 1 },
      );

      const row = current.rows[0];

      if (row === undefined) continue;
      const stored = Schema.decodeSync(storageCodec)(row[state.state]);

      if (stored.moduleId !== mapping.moduleId) continue;
      const record = stored.record;

      if (
        (Schema.is(AdmissionReceipt)(record) && record.expiresAtMillis <= now) ||
        (Schema.is(AdmissionCounter)(record) &&
          (record.window + 1) * mapping.admission.windowMillis <= now)
      ) {
        yield* owner.remove(state.table, { [state.scope]: row[state.scope] });
        deleted++;
      }
    }

    return {
      deleted,
      nextCursor: rows.length === input.limit ? String(rows[rows.length - 1]![state.scope]) : null,
    };
  });

  return {
    unavailable,
    invariant,
    equal,
    copiedRow,
    col,
    capturePhone,
    lookupPhone,
    admitPhone,
    preparePhoneMutation,
    cleanupPhoneAdmission,
  };
};
