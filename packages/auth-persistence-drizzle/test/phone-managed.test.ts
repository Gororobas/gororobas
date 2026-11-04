import * as NodeCrypto from "@effect/platform-node/NodeCrypto";
import * as D1Client from "@effect/sql-d1/D1Client";
import * as SqliteClient from "@effect/sql-sqlite-node/SqliteClient";
import { it } from "@effect/vitest";
import { Auth, Operations, PhoneOtp, Proofs, Sessions, SmsDelivery } from "@yielded/auth";
import type { LoginIdentifier } from "@yielded/auth/Identity";
import { SubjectId } from "@yielded/auth/Schema";
import { getTableName } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Redacted from "effect/Redacted";
import * as Schema from "effect/Schema";
import * as SqlClient from "effect/sql/SqlClient";
import { expect } from "vite-plus/test";

import { AuthPersistence as D1Persistence } from "../src/D1";
import { AuthPersistence as SqlitePersistence } from "../src/SqliteNode";
import { migrate, requiredService } from "./fixtures/oauth-managed";
import { makeD1Transport } from "./fixtures/proof-sqlite";

// Human-requested red/green seam (2026-10-25): managed phone registration through
// public Auth operations, including application provisioning and atomic rollback.
// D1 substitutes only its transport; production batch SQL runs on real SQLite.
const subjects = sqliteTable("phone_members", {
  id: text().primaryKey(),
  active: integer({ mode: "boolean" }).notNull(),
  revision: text().notNull(),
  displayName: text("display_name").notNull(),
});

const Claims = Schema.Struct({ displayName: Schema.String });
const phoneNumber = "+27820000001";

const keyring = {
  activeKeyId: "test",
  keys: [{ id: "test", material: Redacted.make("A".repeat(43)) }],
};

const setup = Effect.fnUntraced(function* (
  backend: "sqlite" | "d1",
  lifecycle: true | PhoneOtp.PhoneLifecyclePolicy = true,
) {
  const app = Auth.make("test/managed-phone", {
    claims: Claims,
    sessions: Sessions.stateful({ maxAge: "1 hour" }),
    strategies: { phone: PhoneOtp.make({ namespace: "phone", lifecycle }) },
    defaultStrategy: "phone",
  });

  const phone = app.strategies.phone;
  const persistence = (backend === "d1" ? D1Persistence : SqlitePersistence).make(app);

  const storage = persistence.managed({
    prefix: "phone_test",
    subjects: {
      table: subjects,
      id: "id",
      status: "active",
      activeValue: true,
      securityRevision: "revision",
      idCodec: SubjectId,
      requirements: () =>
        Effect.succeed({
          alternatives: [
            {
              factors: ["possession"],
              minimumCredentials: 1,
              userVerified: false,
              phishingResistant: false,
            },
          ],
          maximumAgeMillis: 300_000,
        }),
    },
  });

  let batches = 0;
  const sqlite = SqliteClient.layer({ filename: ":memory:" });

  const database =
    backend === "sqlite"
      ? sqlite
      : Layer.effectContext(
          makeD1Transport(
            Effect.sync(() => {
              batches++;
            }),
          ).pipe(
            Effect.map((client) =>
              Context.make(D1Client.D1Client, client).pipe(
                Context.add(SqlClient.SqlClient, client),
              ),
            ),
          ),
        ).pipe(Layer.provide(sqlite));

  const databaseContext = yield* Layer.build(database);
  const sql = Context.get(databaseContext, SqlClient.SqlClient);

  yield* migrate([subjects, ...Object.values(storage.schema)]).pipe(
    Effect.provide(databaseContext),
  );

  let denyProvisioning = false;
  const provisions: { readonly requestId: string; readonly identifier: LoginIdentifier }[] = [];
  const sent: SmsDelivery.SmsMessage[] = [];

  const dependencies = Layer.mergeAll(
    Layer.succeed(persistence.Provisioning, {
      phone: {
        values: Effect.fnUntraced(function* (input: {
          readonly requestId: string;
          readonly identifier: LoginIdentifier;
        }) {
          if (denyProvisioning) return yield* PhoneOtp.PhoneOtpUnavailable.make({});
          provisions.push(input);

          return {
            id: "member-1",
            active: true,
            revision: "member-v1",
            displayName: "Phone member",
          };
        }),
      },
    }),
    Layer.succeed(phone.SessionClaims, {
      resolve: ({ subjectId }) =>
        sql`select display_name from phone_members where id = ${subjectId}`.pipe(
          Effect.flatMap((rows) =>
            Schema.decodeUnknownEffect(Claims)({ displayName: rows[0]?.display_name }),
          ),
          Effect.mapError(() => PhoneOtp.PhoneOtpUnavailable.make({})),
        ),
    }),
    Layer.succeed(SmsDelivery.SmsDelivery, {
      send: (message) =>
        Effect.sync(() => {
          sent.push(message);

          return { _tag: "Accepted" as const };
        }),
    }),
    Layer.succeed(PhoneOtp.PhoneDeliveryEligibility, { allowed: () => Effect.succeed(true) }),
    Layer.succeed(PhoneOtp.PhoneActionEvidence, {
      verify: () => Effect.fail(PhoneOtp.PhoneActionRequired.make({})),
    }),
    PhoneOtp.Template.layer({ render: (code) => code }),
    Proofs.ProofDispatchScheduler.layerInline,
    Proofs.ProofKeys.layer(keyring),
    Auth.RequestBindingConfig.layer({ generation: 1, lifetimeMillis: 120_000, keyring }),
    Layer.succeed(Sessions.SessionSigningKeys, keyring),
  );

  const context = yield* Layer.build(
    persistence.layer.pipe(
      Layer.provideMerge(dependencies),
      Layer.provideMerge(NodeCrypto.layer),
      Layer.provideMerge(Layer.succeedContext(databaseContext)),
      Layer.provide(persistence.Config.layer(storage)),
    ),
  );

  requiredService(context, PhoneOtp.PhonePersistence);
  const auth = yield* app.make.pipe(Effect.provide(context));
  const delivered = new Map<Operations.CredentialSlot, Redacted.Redacted<string>>();

  const request = {
    invocation: Operations.guest,
    credentials: {},
    credentialCommandSink: (commands: readonly Operations.AuthCredentialCommand[]) =>
      Effect.sync(() => {
        for (const command of commands) {
          if (command._tag === "Issue") delivered.set(command.slot, command.credential);
          else if (command._tag === "Clear") delivered.delete(command.slot);
        }
      }),
  };

  const asGuest = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
    effect.pipe(
      Effect.provideService(Auth.AuthRequest, request),
      Effect.provideService(PhoneOtp.PhoneRequestContext, {
        networkKey: Redacted.make("local-test"),
      }),
    );

  const credential = (slot: Operations.CredentialSlot) => {
    const value = delivered.get(slot);

    if (value === undefined) throw new Error(`Missing private ${slot} credential`);

    return value;
  };

  const code = (proofId: string) => {
    const message = sent.find((value) => value.id === proofId);

    if (message === undefined) throw new Error("SMS challenge was not delivered");

    return Redacted.value(message.body);
  };

  const begin = Effect.gen(function* () {
    const input = {
      action: "register" as const,
      flowId: "registration-flow",
      commandId: "registration-command",
      requestId: "registration-request",
      phoneNumber,
      locale: "en-ZA",
    };

    const challenge = yield* asGuest(auth.begin(input));

    return {
      ...input,
      requestBinding: Redacted.value(credential("request-binding")),
      reference: challenge.reference,
      code: code(challenge.reference.proofId),
    };
  });

  const state = Effect.gen(function* () {
    const counts: Record<string, number> = {};

    for (const [role, table] of Object.entries({ subjects, ...storage.schema })) {
      const rows = yield* sql`select count(*) as count from ${sql(getTableName(table))}`;

      counts[role] = Number(rows[0]?.count);
    }

    return counts;
  });

  return {
    auth,
    sql,
    storage,
    provisions,
    delivered,
    credential,
    code,
    asGuest,
    begin,
    state,
    deny: (value: boolean) => {
      denyProvisioning = value;
    },
    assertBatch: () => {
      if (backend === "d1") expect(batches).toBeGreaterThan(0);
    },
  };
});

it.live.each(["sqlite", "d1"] as const)(
  "%s managed phone registration creates the application account and supports subsequent login",
  (backend) =>
    Effect.gen(function* () {
      const f = yield* setup(backend, {
        maximumEvidenceAgeMillis: 60_000,
        requireImmediateInvalidation: true,
      });

      const input = yield* f.begin;

      expect(f.provisions).toHaveLength(0);
      expect(yield* f.state).toMatchObject({
        subjects: 0,
        credentials: 0,
        identifiers: 0,
        proofs: 1,
      });
      const result = yield* f.asGuest(f.auth.completeLifecycle(input));

      expect(result).toMatchObject({
        _tag: "Registered",
        completion: {
          _tag: "Authenticated",
          session: { subjectId: "member-1", claims: { displayName: "Phone member" } },
        },
      });
      expect((yield* f.auth.verifySession(f.credential("session"))).subjectId).toBe("member-1");
      expect(f.provisions).toEqual([
        { requestId: expect.any(String), identifier: { namespace: "phone", value: phoneNumber } },
      ]);
      expect(yield* f.sql`select * from phone_members`).toEqual([
        { id: "member-1", active: 1, revision: "member-v1", display_name: "Phone member" },
      ]);
      expect(yield* f.state).toMatchObject({
        subjects: 1,
        credentials: 1,
        identifiers: 1,
        proofs: 0,
      });
      const challenge = yield* f.asGuest(f.auth.signIn({ phoneNumber, locale: "en-ZA" }));

      const login = yield* f.asGuest(
        f.auth.completeSignIn({
          flowId: challenge.flowId,
          phoneNumber,
          requestBinding: Redacted.value(f.credential("request-binding")),
          reference: challenge.reference,
          code: f.code(challenge.reference.proofId),
        }),
      );

      expect(login).toMatchObject({ _tag: "Authenticated", session: { subjectId: "member-1" } });
      f.assertBatch();
    }),
);

it.live.each(["sqlite", "d1"] as const)(
  "%s managed phone registration preserves the proof on provisioning or credential-write failure",
  (backend) =>
    Effect.gen(function* () {
      const f = yield* setup(backend);
      const input = yield* f.begin;
      const before = yield* f.state;

      f.deny(true);
      expect(yield* f.asGuest(f.auth.completeLifecycle(input)).pipe(Effect.result)).toMatchObject({
        _tag: "Failure",
        failure: { _tag: "PhoneOtpUnavailable" },
      });
      expect(yield* f.state).toEqual(before);
      expect(f.delivered.has("session")).toBe(false);
      f.deny(false);
      const credentials = getTableName(f.storage.schema.credentials);

      yield* f.sql.unsafe(
        `create trigger reject_phone before insert on "${credentials}" begin select raise(abort, 'credential write failed'); end`,
      );
      expect(yield* f.asGuest(f.auth.completeLifecycle(input)).pipe(Effect.result)).toMatchObject({
        _tag: "Failure",
        failure: { _tag: "PhoneOtpUnavailable" },
      });
      expect(yield* f.state).toEqual(before);
      expect(f.delivered.has("session")).toBe(false);
      yield* f.sql`drop trigger reject_phone`;
      expect(yield* f.asGuest(f.auth.completeLifecycle(input))).toMatchObject({
        _tag: "Registered",
        completion: { _tag: "Authenticated" },
      });
      const after = yield* f.state;
      const provisions = f.provisions.length;

      expect(yield* f.asGuest(f.auth.completeLifecycle(input)).pipe(Effect.result)).toMatchObject({
        _tag: "Failure",
        failure: { _tag: "PhoneOtpRejected" },
      });
      expect(yield* f.state).toEqual(after);
      expect(f.provisions).toHaveLength(provisions);
      f.assertBatch();
    }),
);
