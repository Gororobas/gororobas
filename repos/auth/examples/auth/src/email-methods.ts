import { BunRuntime } from "@effect/platform-bun";
import { Auth, EmailDelivery, Email, Hooks, Operations, Proofs, WebCrypto } from "@yielded/auth";
import { Effect, Layer, Redacted } from "effect";
import { Base64Url } from "effect/encoding";
import { HttpRouter, HttpServerResponse } from "effect/http";

import { emailAuth, makeEmailConsumer, sessions, sessionPolicy } from "./email-methods-consumer";

const program = Effect.gen(function* () {
  for (const mode of ["stateless", "stateful"] as const) {
    const deliveries: EmailDelivery.EmailMessage[] = [];
    const notifications: string[] = [];
    const commands: Operations.AuthCredentialCommand[] = [];
    const notify = Email.emailIdentifierNotifications("example/email");

    const notifier = Layer.succeed(Email.EmailIdentifierNotifier, {
      notify: (input) =>
        Effect.sync(() => {
          notifications.push(input.eventId);
        }),
    });

    const hooks = Hooks.composeHooks(notify.contribution).pipe(
      Layer.provide(notify.layer.pipe(Layer.provide(notifier))),
    );

    const base = Layer.mergeAll(
      WebCrypto.layerWebCrypto,
      hooks,
      Proofs.ProofDispatchScheduler.layerInline,
    );

    yield* Effect.gen(function* () {
      const model = yield* makeEmailConsumer;

      const binding = Auth.RequestBindingConfig.layer({
        lifetimeMillis: 300_000,
        generation: 1,
        keyring: {
          activeKeyId: "binding",
          keys: [
            {
              id: "binding",
              // Demo-only key material. Production requires independently generated random keys.
              material: Redacted.make(Base64Url.encode(new Uint8Array(32).fill(31))),
            },
          ],
        },
      }).pipe(Layer.provide(base));

      const stateless = sessions
        .statelessLayer(sessionPolicy, {
          activeKeyId: "session",
          keys: [
            {
              id: "session",
              // Demo-only key material. Production requires independently generated random keys.
              material: Redacted.make(Base64Url.encode(new Uint8Array(32).fill(42))),
            },
          ],
        })
        .pipe(Layer.provide(base));

      const stateful = sessions
        .statefulLayer(sessionPolicy)
        .pipe(Layer.provide(model.layer), Layer.provide(base));

      const strategy = mode === "stateless" ? stateless : stateful;

      const completion = sessions
        .completionLayer()
        .pipe(Layer.provide(Layer.mergeAll(strategy, model.layer)), Layer.provide(base));

      const sender = Layer.succeed(EmailDelivery.EmailDelivery, {
        send: (message) =>
          Effect.sync(() => {
            deliveries.push(message);
          }),
      });

      const returns = Email.EmailReturnTargets.exactRoutes(["/account", "/settings"]);

      const capabilities = Layer.mergeAll(
        model.layer,
        binding,
        completion,
        strategy,
        returns,
        sender,
      );

      const sessionVerify = sessions.operations.Verify.handlerLayer(
        Effect.fn("ExampleEmail.VerifySession")(function* (input) {
          return yield* (yield* sessions.SessionStrategy).verify(input.credential);
        }),
      ).pipe(Layer.provide(strategy));

      const handlers = Layer.merge(capabilities, sessionVerify);

      const call = {
        credentials: {},
        credentialCommandSink: (batch: readonly Operations.AuthCredentialCommand[]) =>
          Effect.sync(() => {
            commands.push(...batch);
          }),
      };

      const latest = (slot: "request-binding" | "proof-continuation" | "session") => {
        const command = [...commands].reverse().find((c) => c._tag === "Issue" && c.slot === slot);

        if (command?._tag !== "Issue") throw new Error(`missing example ${slot}`);

        return Redacted.value(command.credential);
      };

      const delivered = () => {
        const message = deliveries[deliveries.length - 1];

        if (!message) throw new Error("missing example delivery");

        return message;
      };

      yield* Effect.gen(function* () {
        const auth = yield* emailAuth.make;

        const begin = Effect.fn("ExampleEmail.begin")(function* (flowId: string) {
          yield* auth.beginSignIn({ flowId });

          return { flowId, requestBinding: latest("request-binding") };
        });

        const addressEmail = "reader@example.invalid";
        const registerFlow = yield* begin("registration");

        const registerBase = {
          ...registerFlow,
          email: addressEmail,
          registration: { team: "staff", number: "42" },
        };

        const requested = yield* auth.register("registration", {
          ...registerBase,
          requestId: "register-request",
          locale: "en",
        });

        const regProof = yield* auth.verifyRegistration("registration", {
          ...registerBase,
          reference: requested.reference,
          secret: Redacted.value(delivered().text).match(/code is ([0-9]+)/)?.[1] ?? "",
        });

        const registered = yield* auth.completeRegistration("registration", {
          ...registerBase,
          commandId: "register-command",
          continuationId: regProof.continuation.continuationId,
          credential: latest("proof-continuation"),
        });

        if (
          registered._tag !== "RegistrationAccepted" ||
          commands.some((c) => c._tag === "Issue" && c.slot === "session")
        )
          return yield* Effect.die("registration must not issue a session");
        const signInFlow = yield* begin("code-sign-in");
        const signInBase = { ...signInFlow, email: addressEmail, returnTarget: "/account" };

        const codeRequest = yield* auth.signIn({
          ...signInBase,
          requestId: "code-request",
          locale: "en",
        });

        const codeSecret = Redacted.value(delivered().text).match(/code is ([0-9]+)/)?.[1] ?? "";

        const duplicate = yield* auth.signIn({
          ...signInBase,
          requestId: "code-request",
          locale: "en",
        });

        if (duplicate.reference.proofId !== codeRequest.reference.proofId)
          return yield* Effect.die("request replay changed reference");

        const wrongPurpose = yield* auth
          .verifySignIn({
            ...signInBase,
            reference: { ...codeRequest.reference, purpose: "email-address-change" },
            secret: codeSecret,
          })
          .pipe(Effect.result);

        if (wrongPurpose._tag !== "Failure")
          return yield* Effect.die("wrong-purpose proof accepted");

        const codeProof = yield* auth.verifySignIn({
          ...signInBase,
          reference: codeRequest.reference,
          secret: codeSecret,
        });

        const signedIn = yield* auth.completeSignIn({
          ...signInBase,
          continuationId: codeProof.continuation.continuationId,
          credential: latest("proof-continuation"),
        });

        if (
          signedIn.completion._tag !== "Authenticated" ||
          signedIn.completion.session.claims.number !== 42
        )
          return yield* Effect.die("email sign-in or exact claims failed");
        const session = signedIn.completion.session;

        const caller = {
          _tag: "Authenticated" as const,
          subjectId: session.subjectId,
          sessionId: session.sessionId,
          assurance: session.assurance,
        };

        const firstSessionToken = latest("session");
        const linkFlow = yield* begin("link-sign-in");
        const linkBase = { ...linkFlow, email: addressEmail, returnTarget: "/account" };

        const linkRequest = yield* auth.signIn("link", {
          ...linkBase,
          requestId: "link-request",
          locale: "en",
        });

        const linkUrl = Redacted.value(delivered().text).match(/https:\/\/\S+/)?.[0];

        if (!linkUrl) return yield* Effect.die("sign-in link missing from email");
        const parsedUrl = new URL(linkUrl);
        // A link preview performs only this static GET. The proof lives in the
        // fragment and never reaches the landing server or an automatic operation.
        const landingRequest = new Request(`${parsedUrl.origin}${parsedUrl.pathname}`);
        const beforeScannerCommands = commands.length;

        const landing = yield* Effect.acquireUseRelease(
          Effect.sync(() =>
            HttpRouter.toWebHandler(
              HttpRouter.add(
                "GET",
                "/email",
                HttpServerResponse.text(
                  "<!doctype html><button type=button>Confirm sign-in in the originating client</button>",
                  { contentType: "text/html", headers: EmailDelivery.linkLandingHeaders },
                ),
              ),
              { disableLogger: true },
            ),
          ),
          (web) => Effect.promise(() => web.handler(landingRequest)),
          (web) => Effect.promise(() => web.dispose()),
        );

        if (landing.status !== 200 || commands.length !== beforeScannerCommands)
          return yield* Effect.die("scanner GET touched authentication");

        if (
          landingRequest.url.includes(parsedUrl.hash) ||
          landing.headers.get("Referrer-Policy") !== "no-referrer"
        )
          return yield* Effect.die("landing leaked a fragment");
        const fragment = Redacted.make(parsedUrl.hash);

        parsedUrl.hash = ""; // Browser history.replaceState performs this before UI work.
        const extracted = yield* EmailDelivery.parseLinkFragment(fragment);
        const otherDevice = yield* begin("link-sign-in");

        const crossDevice = yield* auth
          .verifySignIn("link", {
            ...linkBase,
            requestBinding: otherDevice.requestBinding,
            reference: extracted.reference,
            secret: Redacted.value(extracted.secret),
          })
          .pipe(Effect.result);

        if (crossDevice._tag !== "Failure")
          return yield* Effect.die("forwarded link replaced another client's session");

        // The next explicit operation represents intentional confirmation in the
        // originating client, using its retained binder/target rather than URL fields.
        const linkProof = yield* auth.verifySignIn("link", {
          ...linkBase,
          reference: linkRequest.reference,
          secret: Redacted.value(extracted.secret),
        });

        const linked = yield* auth.completeSignIn("link", {
          ...linkBase,
          continuationId: linkProof.continuation.continuationId,
          credential: latest("proof-continuation"),
        });

        if (linked.completion._tag !== "Authenticated" || linked.returnTarget !== "/account")
          return yield* Effect.die("intentional link completion failed");
        const verifyFlow = yield* begin("verify-address");

        const verifyBase = {
          ...verifyFlow,
          commandId: "verify-command",
          email: "alias@example.invalid",
        };

        const verifyRequest = yield* auth
          .requestEmailVerification("addresses", {
            ...verifyBase,
            requestId: "verify-request",
            locale: "en",
            actionProof: "fixture:verify-request",
          })
          .pipe(Effect.provideService(Auth.AuthRequest, { ...call, invocation: caller }));

        const verifyCode = Redacted.value(delivered().text).match(/code is ([0-9]+)/)?.[1] ?? "";

        const verifiedProof = yield* auth
          .verifyEmailAddress("addresses", {
            ...verifyBase,
            reference: verifyRequest.reference,
            secret: verifyCode,
          })
          .pipe(Effect.provideService(Auth.AuthRequest, { ...call, invocation: caller }));

        const beforeVerification = commands.filter(
          (c) => c._tag === "Issue" && c.slot === "session",
        ).length;

        const verified = yield* auth
          .completeEmailVerification("addresses", {
            ...verifyBase,
            continuationId: verifiedProof.continuation.continuationId,
            credential: latest("proof-continuation"),
            actionProof: "fixture:verify-complete",
          })
          .pipe(Effect.provideService(Auth.AuthRequest, { ...call, invocation: caller }));

        if (verified.invalidation === undefined)
          return yield* Effect.die("adding a new address must invalidate existing authentication");

        if (
          commands.filter((c) => c._tag === "Issue" && c.slot === "session").length !==
          beforeVerification
        )
          return yield* Effect.die("verified identifier silently became authentication");

        const oldSession = yield* sessions.operations.Verify.invoke(Operations.guest, {
          credential: firstSessionToken,
        }).pipe(Effect.result);

        if (
          (mode === "stateful" && oldSession._tag !== "Failure") ||
          (mode === "stateless" && oldSession._tag !== "Success")
        )
          return yield* Effect.die("reported session invalidation differs from selected strategy");
        const refreshFlow = yield* begin("post-verification-sign-in");

        const refreshBase = {
          ...refreshFlow,
          email: "alias@example.invalid",
          returnTarget: "/account",
        };

        const refreshRequest = yield* auth.signIn({
          ...refreshBase,
          requestId: "refresh-request",
          locale: "en",
        });

        const refreshProof = yield* auth.verifySignIn({
          ...refreshBase,
          reference: refreshRequest.reference,
          secret: Redacted.value(delivered().text).match(/code is ([0-9]+)/)?.[1] ?? "",
        });

        const refreshed = yield* auth.completeSignIn({
          ...refreshBase,
          continuationId: refreshProof.continuation.continuationId,
          credential: latest("proof-continuation"),
        });

        if (refreshed.completion._tag !== "Authenticated")
          return yield* Effect.die("fresh sign-in after identity invalidation failed");
        const freshSession = refreshed.completion.session;

        const changeCaller = {
          _tag: "Authenticated" as const,
          subjectId: freshSession.subjectId,
          sessionId: freshSession.sessionId,
          assurance: freshSession.assurance,
        };

        const source = yield* model.snapshotFixture("alias@example.invalid");
        const changeFlow = yield* begin("change-address");

        const changeBase = {
          ...changeFlow,
          commandId: "change-command",
          sourceCredentialId: source.credentialId,
          email: "new@example.invalid",
        };

        const changeRequest = yield* auth
          .requestEmailChange("addresses", {
            ...changeBase,
            requestId: "change-request",
            locale: "en",
            actionProof: "fixture:change-request",
          })
          .pipe(Effect.provideService(Auth.AuthRequest, { ...call, invocation: changeCaller }));

        const changeProof = yield* auth
          .verifyEmailChange("addresses", {
            ...changeBase,
            reference: changeRequest.reference,
            secret: Redacted.value(delivered().text).match(/code is ([0-9]+)/)?.[1] ?? "",
          })
          .pipe(Effect.provideService(Auth.AuthRequest, { ...call, invocation: changeCaller }));

        const changeInput = {
          ...changeBase,
          continuationId: changeProof.continuation.continuationId,
          credential: latest("proof-continuation"),
          actionProof: "fixture:change-complete",
        };

        yield* auth
          .completeEmailChange("addresses", changeInput)
          .pipe(Effect.provideService(Auth.AuthRequest, { ...call, invocation: changeCaller }));

        const replay = yield* auth
          .completeEmailChange("addresses", changeInput)
          .pipe(Effect.provideService(Auth.AuthRequest, { ...call, invocation: changeCaller }))
          .pipe(Effect.result);

        if (replay._tag !== "Failure" || notifications.length !== 1)
          return yield* Effect.die("address change replay/notification failed");
        yield* model.requireMfaFixture(caller.subjectId);
        const mfaFlow = yield* begin("mfa-email-primary");
        const mfaBase = { ...mfaFlow, email: "new@example.invalid", returnTarget: "/account" };

        const mfaRequest = yield* auth.signIn({
          ...mfaBase,
          requestId: "mfa-request",
          locale: "en",
        });

        const mfaProof = yield* auth.verifySignIn({
          ...mfaBase,
          reference: mfaRequest.reference,
          secret: Redacted.value(delivered().text).match(/code is ([0-9]+)/)?.[1] ?? "",
        });

        const mfa = yield* auth
          .completeSignIn({
            ...mfaBase,
            continuationId: mfaProof.continuation.continuationId,
            credential: latest("proof-continuation"),
          })
          .pipe(Effect.result);

        if (mfa._tag !== "Failure")
          return yield* Effect.die("email primary bypassed required additional factor");
        yield* Effect.log({
          mode,
          registration: registered._tag,
          codeClaims: session.claims,
          linkTarget: linked.returnTarget,
          crossDevice: crossDevice.failure._tag,
          oldSession: oldSession._tag,
          invalidation: verified.invalidation.existingSessions,
          notifications: notifications.length,
          mfa: mfa.failure._tag,
        });
      }).pipe(
        Effect.scoped,
        Effect.provideService(Auth.AuthRequest, { ...call, invocation: Operations.guest }),
        // This CLI host owns its caller; HTTP hosts derive a fresh key per request.
        Effect.provideService(
          Proofs.ProofRequestContext,
          Effect.succeed({ networkKey: Redacted.make(`email-cli-${mode}`) }),
        ),
        Effect.provide(handlers),
      );
    }).pipe(Effect.provide(base));
  }
});

BunRuntime.runMain(program);
