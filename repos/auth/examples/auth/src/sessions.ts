import { BunRuntime } from "@effect/platform-bun";
import { Hooks, Operations, Schema as AuthSchema, Sessions, WebCrypto } from "@yielded/auth";
import { DateTime, Effect, Layer, Redacted, Schema } from "effect";
import { Base64Url } from "effect/encoding";
import { HttpRouter } from "effect/http";
import { RpcSerialization, RpcServer } from "effect/rpc";

import {
  exampleAuthority,
  initialRevision,
  policy,
  staffSessions,
  subjectId,
} from "./session-consumer";

const keyring = {
  activeKeyId: "current",
  keys: [
    {
      id: "current",
      // Demo-only key material. Production requires independently generated random keys.
      material: Redacted.make(Base64Url.encode(new Uint8Array(32).fill(42))),
    },
  ],
};

const base = Layer.mergeAll(WebCrypto.layerWebCrypto, Hooks.LifecycleHooks.empty);
const authority = Layer.unwrap(exampleAuthority).pipe(Layer.provide(base));

const stateful = staffSessions
  .statefulLayer(policy)
  .pipe(Layer.provide(authority), Layer.provide(base));

const stateless = staffSessions.statelessLayer(policy, keyring).pipe(Layer.provide(base));

const application = (strategy: typeof stateless) => {
  const capabilities = Layer.mergeAll(strategy, authority);

  const completion = staffSessions
    .completionLayer()
    .pipe(Layer.provide(capabilities), Layer.provide(base));

  return staffSessions
    .handlersLayer({ maximumAgeMillis: 60_000 })
    .pipe(Layer.provideMerge(Layer.mergeAll(capabilities, completion)));
};

const program = Effect.gen(function* () {
  for (const [mode, strategy] of [
    ["stateful", stateful],
    ["stateless", stateless],
  ] as const) {
    const handlers = application(strategy);

    yield* Effect.gen(function* () {
      const captured: Operations.AuthCredentialCommand[] = [];

      const call = {
        credentialCommandSink: (commands: ReadonlyArray<Operations.AuthCredentialCommand>) =>
          Effect.sync(() => {
            captured.push(...commands);
          }),
      };

      const now = yield* DateTime.now;

      const evidence: Sessions.AuthenticationEvidence = {
        flowId: Sessions.AuthenticationFlowId.make(`example-${mode}`),
        bindingDigest: AuthSchema.TokenDigest.make("example-binding"),
        revision: {
          subjectId,
          securityRevision: initialRevision,
          credentials: [{ credentialId: "device-1", revision: initialRevision }],
        },
        proofs: [
          {
            method: "consumer-device",
            credentialId: "device-1",
            factors: ["possession"],
            userVerified: true,
            phishingResistant: true,
            verifiedAt: now,
          },
        ],
      };

      const input = {
        evidence: yield* Schema.encodeEffect(Sessions.AuthenticationEvidence)(evidence),
        claims: { tenant: "acme", staffNumber: "42" },
      };

      const complete = yield* staffSessions.operations.Complete.invoke(
        { _tag: "System", authority: "verified-example-method" },
        input,
      ).pipe(
        Effect.provideService(
          Operations.AuthCredentialCommandCollector,
          call.credentialCommandSink,
        ),
      );

      if (complete._tag !== "Authenticated")
        return yield* Effect.die(new Error("Example unexpectedly required another factor"));

      const issued = captured.find(
        (command) => command._tag === "Issue" && command.slot === "session",
      );

      if (issued?._tag !== "Issue")
        return yield* Effect.die(new Error("Example collector did not receive a session"));
      const token = Redacted.value(issued.credential);

      const verified = yield* staffSessions.operations.Verify.invoke(Operations.guest, {
        credential: token,
      });

      const inspected = yield* (yield* staffSessions.SessionStrategy).inspect(issued.credential);

      if (
        inspected.provenance.evidence.flowId !== evidence.flowId ||
        !Object.isFrozen(inspected.provenance.evidence.proofs[0].verifiedAt) ||
        "provenance" in verified ||
        "credentialVersion" in verified
      )
        return yield* Effect.die("Session inspection lost private provenance/projection");

      const caller = {
        _tag: "Authenticated" as const,
        subjectId: verified.subjectId,
        sessionId: verified.sessionId,
        assurance: verified.assurance,
      };

      const list = yield* staffSessions.operations.List.invoke(caller, {
        credential: token,
        limit: 20,
      }).pipe(Effect.result);

      const signOut = yield* staffSessions.operations.SignOut.invoke(Operations.guest, {
        credential: token,
      }).pipe(
        Effect.provideService(
          Operations.AuthCredentialCommandCollector,
          call.credentialCommandSink,
        ),
      );

      const afterSignOut = yield* staffSessions.operations.Verify.invoke(Operations.guest, {
        credential: token,
      }).pipe(Effect.result);

      yield* Effect.log({
        mode,
        staffNumber: verified.claims.staffNumber,
        list: list._tag === "Failure" ? list.failure._tag : list.success.sessions.length,
        signOut,
        afterSignOut: afterSignOut._tag,
      });

      if (mode === "stateless") {
        // This verifier installs no AuthenticationAuthority, persistence, or completion capability.
        const pureVerify = staffSessions.operations.Verify.handlerLayer(
          Effect.fn("Example.verifyOnly")(function* (input) {
            return yield* (yield* staffSessions.SessionStrategy).verify(input.credential);
          }),
        ).pipe(Layer.provide(stateless));

        const independentlyVerified = yield* staffSessions.operations.Verify.invoke(
          Operations.guest,
          {
            credential: token,
          },
        ).pipe(Effect.provide(pureVerify));

        const group = Operations.remoteGroup([staffSessions.operations.Verify], {
          allowInternal: true,
        });

        const handlersRpc = group
          .toLayer({
            "example/staff/session/verify": staffSessions.operations.Verify.rpcHandler(() =>
              Effect.succeed(Operations.guest),
            ),
          })
          .pipe(Layer.provide(pureVerify));

        const http = RpcServer.layerHttp({ group, path: "/sessions", protocol: "http" }).pipe(
          Layer.provide(handlersRpc),
          Layer.provide(RpcSerialization.layerJson),
        );

        const web = HttpRouter.toWebHandler(http);

        const response = yield* Effect.tryPromise(() =>
          web.handler(
            new Request("http://example.test/sessions", {
              method: "POST",
              headers: { "content-type": "application/json" },
              // oxlint-disable-next-line no-restricted-properties -- Exercise the external Effect RPC JSON request envelope.
              body: JSON.stringify({
                _tag: "Request",
                id: "session-example",
                tag: "example/staff/session/verify",
                payload: { credential: token },
                headers: [],
              }),
            }),
          ),
        );

        const encoded = yield* Effect.tryPromise(() => response.text());

        yield* Effect.promise(() => web.dispose());
        yield* Effect.log({
          independentClaims: independentlyVerified.claims,
          rpcContainsBearer: encoded.includes(token),
          rpcStatus: response.status,
        });
      }
    }).pipe(Effect.provide(handlers));
  }
}).pipe(Effect.provide(base));

BunRuntime.runMain(program);
