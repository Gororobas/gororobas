import { DateTime, Effect, Layer, Redacted, Schema } from "effect";

import { cryptoLayer } from "../auth/defaults";
import { hasCommitScope } from "../hooks/commit";
import { credentialSlots } from "../http-operation/models";
import { OperationHttpServerConfig } from "../http-operation/OperationHttpServerConfig";
import { make as makeHttpServer } from "../http-operation/server";
import { TokenDigest } from "../Schema";
import { assessAuthentication } from "../sessions/assurance";
import { AuthenticationAuthority } from "../sessions/AuthenticationAuthority";
import {
  AuthenticationFlowId,
  SessionAuthenticationProvenance,
  SessionCredentialVersion,
} from "../sessions/models";
import type { makeSessionModule } from "../sessions/module";
import { makeContract } from "./contract";
import { makeSecrets } from "./crypto";
import {
  type Binding,
  type Client,
  Clients,
  ConfigurationError,
  Indeterminate,
  Invalid,
  Persistence,
  Record,
  Unavailable,
} from "./models";

/** Configure first-party session handoff. Build `layer` to validate configuration
 * and acquire the required services. This installs no login UI or OAuth issuer. */
export const make = <
  const Id extends string,
  Claims extends Schema.Codec<unknown, unknown, unknown, unknown>,
>(
  sessions: ReturnType<typeof makeSessionModule<Id, Claims>>,
  options: {
    readonly basePath: string;
    readonly clients: ReadonlyArray<Client>;
    readonly lifetimeMillis?: number;
  },
) => {
  const contract = makeContract(sessions.moduleId, sessions.Session, options);

  const Source = Schema.Struct({
    session: sessions.Session,
    provenance: SessionAuthenticationProvenance,
    credentialVersion: SessionCredentialVersion,
  });

  const sourceCodec = Schema.toCodecJson(Source);
  const now = DateTime.now.pipe(Effect.map(DateTime.toEpochMillis));

  const layer = Layer.unwrap(
    Effect.gen(function* () {
      const config = yield* Schema.decodeEffect(
        Schema.Struct({
          clients: Clients,
          lifetimeMillis: Schema.Int.check(Schema.isBetween({ minimum: 1000, maximum: 300_000 })),
        }),
      )({ clients: options.clients, lifetimeMillis: options.lifetimeMillis ?? 120_000 }).pipe(
        Effect.mapError(() => ConfigurationError.make({})),
      );

      const store = yield* Persistence;
      const strategy = yield* sessions.SessionStrategy;
      const secrets = yield* makeSecrets;
      const namespace = `${sessions.moduleId}/browser-login`;

      const standalone = Effect.gen(function* () {
        if (yield* hasCommitScope) return yield* Unavailable.make({});
      });

      const read = Effect.fnUntraced(function* (id: string) {
        yield* standalone;
        const record = yield* store.get(namespace, id);

        if (record === undefined) return yield* Invalid.make({});

        return yield* Schema.decodeEffect(Record)(record).pipe(
          Effect.mapError(() => Unavailable.make({})),
        );
      });

      const bound = Effect.fnUntraced(function* (input: typeof Binding.Type) {
        const record = yield* read(input.attemptId);

        if (
          record.clientId !== input.clientId ||
          record.challenge !== (yield* secrets.digest(Redacted.value(input.verifier)))
        )
          return yield* Invalid.make({});

        return record;
      });

      const update = Effect.fnUntraced(function* (
        id: string,
        record: Record,
        changes: Partial<Record>,
      ) {
        const { source: _source, codeDigest: _codeDigest, ...previous } = record;
        const next = { ...previous, ...changes, version: yield* secrets.random };

        if (!(yield* store.compareAndSet(namespace, id, record.version, next)))
          return yield* Invalid.make({});
      });

      const { initiate, describe, authorize, exchange, status, cancel } = contract.operations;

      return Layer.mergeAll(
        initiate.handlerLayer(
          Effect.fnUntraced(function* (input) {
            yield* standalone;
            if (
              !config.clients.some(
                (client) =>
                  client.clientId === input.clientId && client.returnUrl === input.returnUrl,
              )
            )
              return yield* Invalid.make({});
            const attemptId = yield* secrets.random;
            const createdAtMillis = yield* now;
            const expiresAtMillis = createdAtMillis + config.lifetimeMillis;

            if (
              !(yield* store.insert(namespace, attemptId, {
                ...input,
                createdAtMillis,
                expiresAtMillis,
                version: yield* secrets.random,
                status: "Waiting",
              }))
            )
              return yield* Unavailable.make({});

            return { attemptId, expiresAtMillis };
          }),
        ),
        describe.handlerLayer(
          Effect.fnUntraced(function* (input) {
            const record = yield* read(input.attemptId);

            const client = config.clients.find(
              (client) =>
                client.clientId === record.clientId && client.returnUrl === record.returnUrl,
            );

            if (
              record.status !== "Waiting" ||
              record.expiresAtMillis <= (yield* now) ||
              client === undefined
            )
              return yield* Invalid.make({});

            return {
              clientId: client.clientId,
              displayName: client.displayName,
              browserSession: client.browserSession,
              expiresAtMillis: record.expiresAtMillis,
            };
          }),
        ),
        authorize.handlerLayer(
          Effect.fnUntraced(function* (input, caller) {
            const record = yield* read(input.attemptId);

            const client = config.clients.find(
              (client) =>
                client.clientId === record.clientId && client.returnUrl === record.returnUrl,
            );

            if (
              record.status !== "Waiting" ||
              record.expiresAtMillis <= (yield* now) ||
              client === undefined ||
              (input.decision === "automatic" && client.browserSession !== "automatic")
            )
              return yield* Invalid.make({});
            const source = yield* strategy.inspect(input.credential);

            if (
              caller._tag !== "Authenticated" ||
              caller.subjectId !== source.session.subjectId ||
              input.expectedSessionId !== source.session.sessionId ||
              (client.browserSession === "reauthenticate" &&
                DateTime.toEpochMillis(source.session.assurance.authenticatedAt) <
                  record.createdAtMillis)
            )
              return yield* Invalid.make({});
            const authority = yield* AuthenticationAuthority;
            const requirement = yield* authority.requirements(source.provenance.evidence);

            const assessed = yield* assessAuthentication(
              source.provenance.evidence,
              requirement,
            ).pipe(Effect.mapError(() => Invalid.make({})));

            if (!assessed.satisfied) return yield* Invalid.make({});
            const code = yield* secrets.random;

            yield* update(input.attemptId, record, {
              status: "Authorized",
              approval: { decision: input.decision },
              codeDigest: yield* secrets.digest(code),
              source: yield* Schema.encodeEffect(sourceCodec)(source).pipe(
                Effect.mapError(() => Unavailable.make({})),
              ),
            });
            const url = new URL(record.returnUrl);

            url.searchParams.set("code", code);
            url.searchParams.set("state", record.state);

            return { callbackUrl: Redacted.make(url.href) };
          }),
        ),
        exchange.credentialHandlerLayer(
          Effect.fnUntraced(function* (input) {
            const record = yield* bound(input);

            if (record.status === "Exchanging" || record.status === "Complete")
              return yield* Indeterminate.make({});

            const client = config.clients.find(
              (client) =>
                client.clientId === record.clientId && client.returnUrl === record.returnUrl,
            );

            if (
              client === undefined ||
              record.status !== "Authorized" ||
              record.expiresAtMillis <= (yield* now) ||
              record.source === undefined ||
              record.approval === undefined ||
              (record.approval.decision === "automatic" && client.browserSession !== "automatic") ||
              record.codeDigest !== (yield* secrets.digest(Redacted.value(input.code)))
            )
              return yield* Invalid.make({});

            const source = yield* Schema.decodeEffect(sourceCodec)(record.source).pipe(
              Effect.mapError(() => Unavailable.make({})),
            );

            if (
              client.browserSession === "reauthenticate" &&
              DateTime.toEpochMillis(source.session.assurance.authenticatedAt) <
                record.createdAtMillis
            )
              return yield* Invalid.make({});

            // Claim before issuance. A crash can sacrifice availability but never licenses a second issuance.
            yield* update(input.attemptId, record, {
              status: "Exchanging",
            }).pipe(Effect.mapError(() => Indeterminate.make({})));

            return yield* Effect.gen(function* () {
              const receipt = yield* strategy.prepareHandoff({
                source,
                flowId: AuthenticationFlowId.make(`${namespace}/${input.attemptId}`),
                bindingDigest: TokenDigest.make(record.challenge),
              });

              const result = yield* receipt.read.pipe(
                Effect.mapError(() => Indeterminate.make({})),
              );

              const claimed = yield* read(input.attemptId);

              yield* update(input.attemptId, claimed, {
                status: "Complete",
                sessionId: result.value.sessionId,
              });

              return {
                ...result,
                credentialCommands: [
                  ...result.credentialCommands,
                  ...credentialSlots
                    .filter((slot) => slot !== "session")
                    .map((slot) => ({ _tag: "Clear" as const, slot })),
                ],
              };
            }).pipe(Effect.mapError(() => Indeterminate.make({})));
          }),
        ),
        status.handlerLayer(
          Effect.fnUntraced(function* (input) {
            const record = yield* bound(input);

            return {
              status:
                record.status === "Exchanging" || record.status === "Complete"
                  ? record.status
                  : record.expiresAtMillis <= (yield* now)
                    ? ("Expired" as const)
                    : record.status,
              ...(record.sessionId === undefined ? {} : { sessionId: record.sessionId }),
            };
          }),
        ),
        cancel.handlerLayer(
          Effect.fnUntraced(function* (input) {
            const record = yield* bound(input);

            if (record.status === "Exchanging" || record.status === "Complete")
              return yield* Indeterminate.make({});
            if (record.status === "Cancelled" || record.expiresAtMillis <= (yield* now)) return;
            yield* update(input.attemptId, record, {
              status: "Cancelled",
            });
          }),
        ),
      );
    }),
  ).pipe(Layer.provide(cryptoLayer));

  /** Mount this wrapper: authorization is browser-only; all host operations are
   * native-only. The existing transport still enforces native admission, Origin,
   * CSRF, size bounds and private credential delivery. */
  const http = Effect.gen(function* () {
    const server = yield* makeHttpServer(contract);
    const config = yield* OperationHttpServerConfig;

    if (config.native === undefined) return yield* ConfigurationError.make({});
    const modeHeader = config.native.modeHeader;

    return {
      handle: (request: Request) =>
        Effect.suspend(() => {
          const pathname = new URL(request.url).pathname;

          const browser =
            pathname === contract.routes.authorize.path ||
            pathname === contract.routes.describe.path;

          const native = request.headers.get(modeHeader) === "native";

          if (browser === native)
            return Effect.succeed(
              new Response(null, { status: 403, headers: { "cache-control": "no-store" } }),
            );

          return server.handle(request);
        }),
    };
  });

  return { ...contract, layer, http };
};
