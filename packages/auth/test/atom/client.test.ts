import { it } from "@effect/vitest";
import * as AuthAtom from "@yielded/auth/Atom";
import * as AuthContract from "@yielded/auth/AuthContract";
import * as Client from "@yielded/auth/Client";
import * as AuthSchema from "@yielded/auth/Schema";
import * as Context from "effect/Context";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as HttpClient from "effect/http/HttpClient";
import * as HttpClientResponse from "effect/http/HttpClientResponse";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as KeyValueStore from "effect/persistence/KeyValueStore";
import * as AsyncResult from "effect/reactivity/AsyncResult";
import * as Atom from "effect/reactivity/Atom";
import * as AtomRegistry from "effect/reactivity/AtomRegistry";
import * as Scheduler from "effect/Scheduler";
import * as Schema from "effect/Schema";
import * as Scope from "effect/Scope";
import * as TestClock from "effect/testing/TestClock";
import * as Tracer from "effect/Tracer";
import { expect, test } from "vite-plus/test";

// https://github.com/yielded-dev/auth/commit/81d27d14918acdd48ac2e51c5f34a6af246ea983
// A confirmed sign-out was lost while a subsequent session read waited or failed.
test.each(["session read", "signOut"] as const)(
  "preserves a confirmed signed-out identity from %s through unavailable session reads",
  (confirmation) =>
    Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const contract = AuthContract.make("test/confirmed-sign-out", {
            claims: Schema.Struct({}),
          });

          const entered = yield* Deferred.make<void>();
          const release = yield* Deferred.make<void>();
          let refreshing = false;

          const http = HttpClient.make((request) =>
            Effect.gen(function* () {
              if (request.url.endsWith("/signOut")) {
                refreshing = true;

                return HttpClientResponse.fromWeb(
                  request,
                  Response.json({
                    _tag: "Success",
                    value: { clearCredential: true, invalidation: "revoked" },
                  }),
                );
              }
              if (refreshing) {
                yield* Deferred.succeed(entered, undefined);
                yield* Deferred.await(release);

                return HttpClientResponse.fromWeb(
                  request,
                  Response.json(
                    { _tag: "Failure", error: { _tag: "SessionUnavailable", message: "offline" } },
                    { status: 503 },
                  ),
                );
              }

              return HttpClientResponse.fromWeb(
                request,
                Response.json({ _tag: "Success", value: null }),
              );
            }),
          );

          const AppClient = Client.make(contract, { baseUrl: "https://example.test" });

          const auth = AuthAtom.make(AppClient, {
            layer: AppClient.layer.pipe(Layer.provide(Layer.succeed(HttpClient.HttpClient, http))),
          });

          const registry = yield* Effect.acquireRelease(
            Effect.sync(() => AtomRegistry.make()),
            (value) => Effect.sync(() => value.dispose()),
          );

          yield* AtomRegistry.mount(registry, auth.identity);
          yield* AtomRegistry.getResult(registry, auth.session, { suspendOnWaiting: true });
          expect(registry.get(auth.identity)).toEqual({ _tag: "SignedOut" });
          if (confirmation === "signOut") {
            yield* AtomRegistry.mount(registry, auth.signOut);
            registry.set(auth.signOut, undefined);
            yield* AtomRegistry.getResult(registry, auth.signOut, { suspendOnWaiting: true });
          } else {
            refreshing = true;
            registry.refresh(auth.session);
          }
          yield* Deferred.await(entered);
          expect(registry.get(auth.identity)).toEqual({ _tag: "SignedOut" });
          yield* Deferred.succeed(release, undefined);
          yield* AtomRegistry.getResult(registry, auth.session, {
            suspendOnWaiting: true,
          }).pipe(Effect.result);
          expect(registry.get(auth.session)._tag).toBe("Failure");
          expect(registry.get(auth.identity)).toEqual({ _tag: "SignedOut" });
        }),
      ),
    ),
);

// https://github.com/yielded-dev/auth/commit/81d27d14918acdd48ac2e51c5f34a6af246ea983
// Authentication returned a session but left identity/cache empty until another read.
// Hold response cleanup and the next read to observe settlement and adoption separately.
test.each(["password", "oauth", "registration", "custom"] as const)(
  "adopts the settled %s session before revalidation and retains its offline account",
  (completion) =>
    Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const contract = AuthContract.make("test/adopt-session", {
            claims: Schema.Struct({ name: Schema.String }),
            actions: (sessions) => ({
              signIn: AuthContract.passwordSignIn(sessions),
              completeSignIn: AuthContract.oauthCompleteSignIn(sessions),
              register: AuthContract.oauthRegister(sessions, Schema.Struct({}), {
                authenticate: true,
              }),
              custom: AuthContract.action({
                payload: Schema.Void,
                success: Schema.Struct({ account: sessions.Session }),
                error: Schema.Never,
                mode: "mutation",
                credentials: true,
                subject: {
                  fromSuccess: (value) => value.account.subjectId,
                  sessionFromSuccess: (value) => value.account,
                },
              }),
            }),
          });

          const session = {
            sessionId: "session",
            subjectId: "member",
            securityRevision: "1",
            assurance: { method: "password", factors: ["knowledge"], authenticatedAt: 0 },
            issuedAt: 0,
            expiresAt: 3_600_000,
            absoluteExpiresAt: 3_600_000,
            claims: { name: "confirmed" },
          } satisfies typeof contract.sessions.Session.Encoded;

          const settling = yield* Deferred.make<void>();
          const settled = yield* Deferred.make<void>();
          const reading = yield* Deferred.make<void>();
          const unavailable = yield* Deferred.make<void>();
          let authenticated = false;

          const http = HttpClient.make((request) =>
            Effect.gen(function* () {
              if (request.url.endsWith("/getSession")) {
                if (!authenticated)
                  return HttpClientResponse.fromWeb(
                    request,
                    Response.json({ _tag: "Success", value: null }),
                  );
                yield* Deferred.succeed(reading, undefined);
                yield* Deferred.await(unavailable);

                return HttpClientResponse.fromWeb(
                  request,
                  Response.json(
                    { _tag: "Failure", error: { _tag: "SessionUnavailable", message: "offline" } },
                    { status: 503 },
                  ),
                );
              }
              authenticated = true;
              const requestScope = yield* Effect.serviceOption(Scope.Scope);

              if (Option.isNone(requestScope)) return yield* Effect.die("Missing request Scope");
              yield* Scope.addFinalizer(
                requestScope.value,
                Deferred.succeed(settling, undefined).pipe(Effect.andThen(Deferred.await(settled))),
              );

              const result = { _tag: "Authenticated", session };

              return HttpClientResponse.fromWeb(
                request,
                Response.json({
                  _tag: "Success",
                  value:
                    completion === "oauth"
                      ? { completion: result, returnTarget: "/" }
                      : completion === "custom"
                        ? { account: session }
                        : result,
                }),
              );
            }),
          );

          const store = Context.get(
            yield* Layer.build(KeyValueStore.layerMemory),
            KeyValueStore.KeyValueStore,
          );

          const AppClient = Client.make(contract, { baseUrl: "https://example.test" });

          const auth = AuthAtom.make(AppClient, {
            layer: AppClient.layer.pipe(Layer.provide(Layer.succeed(HttpClient.HttpClient, http))),
            identityCache: {
              key: "identity",
              storage: Layer.succeed(KeyValueStore.KeyValueStore, store),
            },
          });

          const registry = yield* Effect.acquireRelease(
            Effect.sync(() => AtomRegistry.make()),
            (value) => Effect.sync(() => value.dispose()),
          );

          const dispatch = Effect.fnUntraced(function* <I, A, E>(
            atom: Atom.AtomResultFn<I, A, E>,
            input: I,
          ) {
            yield* AtomRegistry.mount(registry, atom);
            registry.set(atom, input);
            yield* AtomRegistry.getResult(registry, atom, { suspendOnWaiting: true });
          });

          yield* AtomRegistry.mount(registry, auth.identity);
          yield* AtomRegistry.getResult(registry, auth.session, { suspendOnWaiting: true });

          const call =
            completion === "password"
              ? dispatch(auth.signIn, { email: "member@example.test", password: "fixture" })
              : completion === "oauth"
                ? dispatch(auth.completeSignIn, {
                    flowId: "flow",
                    provider: "provider",
                    callbackId: "callback",
                    response: { _tag: "Code", code: "code", state: "state" },
                  })
                : completion === "registration"
                  ? dispatch(auth.register, {
                      reference: "r".repeat(43),
                      flowId: "flow",
                      commandId: "command",
                      registration: {},
                    })
                  : dispatch(auth.custom, undefined);

          const fiber = yield* Effect.forkChild(call);

          yield* Deferred.await(settling);
          expect(registry.get(auth.identity)._tag).not.toBe("Verified");
          yield* Deferred.succeed(settled, undefined);
          yield* Fiber.join(fiber);
          expect(registry.get(auth.identity)).toMatchObject({
            _tag: "Verified",
            subjectId: "member",
            snapshot: { claims: { name: "confirmed" } },
          });
          expect(registry.get(auth.session)).toMatchObject({
            _tag: "Success",
            waiting: false,
            value: { subjectId: "member", claims: { name: "confirmed" } },
          });
          expect(JSON.parse((yield* store.get("identity")) ?? "null")).toMatchObject(session);

          let opened = 0;
          const account = auth.runtime.atom(Effect.sync(() => ++opened));

          yield* AtomRegistry.mount(registry, account);
          expect(yield* AtomRegistry.getResult(registry, account)).toBe(1);
          registry.refresh(auth.session);
          expect(registry.get(auth.session).waiting).toBe(true);
          yield* Deferred.await(reading);
          expect(registry.get(auth.identity)).toMatchObject({
            _tag: "Remembered",
            subjectId: "member",
          });
          yield* Deferred.succeed(unavailable, undefined);
          yield* AtomRegistry.getResult(registry, auth.session, { suspendOnWaiting: true }).pipe(
            Effect.result,
          );
          expect(registry.get(auth.identity)).toMatchObject({
            _tag: "Remembered",
            subjectId: "member",
          });
          expect(yield* AtomRegistry.getResult(registry, account)).toBe(1);
          expect(JSON.parse((yield* store.get("identity")) ?? "null")).toMatchObject(session);
        }),
      ),
    ),
);

// d1f2799 retires the SSR seed between confirming its subject and publishing the
// session result. Observe every notification; a browser can batch away this gap.
// Requested regression: one mounted session verifies once, with or without an SSR seed.
test.each(["confirmation", "replacement", "unseeded"] as const)(
  "verifies a mounted session and preserves seed visibility through %s",
  (mode) =>
    Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const contract = AuthContract.make("test/ssr-session", {
            claims: Schema.Struct({ name: Schema.String }),
          });

          const seed = {
            sessionId: "session",
            subjectId: "member",
            securityRevision: "1",
            assurance: { method: "password", factors: ["knowledge"], authenticatedAt: 0 },
            issuedAt: 0,
            expiresAt: 3_600_000,
            absoluteExpiresAt: 3_600_000,
            claims: { name: "seed" },
          } satisfies typeof contract.sessions.Session.Encoded;

          const entered = yield* Deferred.make<void>();
          const response = yield* Deferred.make<void>();
          let calls = 0;
          let name = "confirmed";

          const http = HttpClient.make((request) =>
            Effect.gen(function* () {
              calls++;
              yield* Deferred.succeed(entered, undefined);
              yield* Deferred.await(response);

              return HttpClientResponse.fromWeb(
                request,
                Response.json({
                  _tag: "Success",
                  value: { ...seed, claims: { name } },
                }),
              );
            }),
          );

          const AppClient = Client.make(contract, { baseUrl: "https://example.test" });

          const auth = AuthAtom.make(AppClient, {
            ...(mode === "unseeded" ? {} : { initialSession: seed }),
            layer: AppClient.layer.pipe(Layer.provide(Layer.succeed(HttpClient.HttpClient, http))),
          });

          const registry = yield* Effect.acquireRelease(
            Effect.sync(() => AtomRegistry.make()),
            (value) => Effect.sync(() => value.dispose()),
          );

          const context = yield* AtomRegistry.getResult(registry, auth.runtime);
          const states: Array<string> = [];

          yield* Effect.acquireRelease(
            Effect.sync(() => registry.subscribe(auth.session, (value) => states.push(value._tag))),
            (unsubscribe) => Effect.sync(unsubscribe),
          );
          expect(registry.get(auth.session)).toMatchObject(
            mode === "unseeded"
              ? { _tag: "Initial" }
              : { _tag: "Success", value: { claims: { name: "seed" } }, waiting: true },
          );
          yield* Deferred.await(entered);
          if (mode === "replacement") {
            yield* Context.get(context, AuthAtom.AuthAtomLifetime).replaceSubject(
              AuthSchema.SubjectId.make("member"),
            );
            expect(registry.get(auth.session)._tag).toBe("Initial");
          }
          yield* Deferred.succeed(response, undefined);

          const session = yield* AtomRegistry.getResult(registry, auth.session, {
            suspendOnWaiting: true,
          }).pipe(Effect.timeout("1 second"));

          expect(session?.claims.name).toBe("confirmed");
          expect(calls).toBe(mode === "replacement" ? 2 : 1);
          if (mode !== "unseeded") expect(states.includes("Initial")).toBe(mode === "replacement");

          name = "refreshed";
          registry.refresh(auth.session);
          expect(
            (yield* AtomRegistry.getResult(registry, auth.session, {
              suspendOnWaiting: true,
            }))?.claims.name,
          ).toBe("refreshed");
          expect(calls).toBe(mode === "replacement" ? 3 : 2);
        }),
      ),
    ),
);

// d1f2799 also restarts custom queries that discover the account. Their own
// transition must retire account work; unrelated replacements clear their results.
test("subject queries retire account work and discard unrelated account results", () =>
  Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const contract = AuthContract.make("test/session-replacement", {
          claims: Schema.Struct({}),
          actions: (sessions) => ({
            discover: AuthContract.action({
              payload: Schema.Void,
              success: Schema.NullOr(sessions.Session),
              error: Schema.Never,
              mode: "query",
              subject: { fromSuccess: (value) => value?.subjectId ?? null },
            }),
          }),
        });

        const session = {
          sessionId: "session",
          subjectId: "member",
          securityRevision: "1",
          assurance: { method: "password", factors: ["knowledge"], authenticatedAt: 0 },
          issuedAt: 0,
          expiresAt: 3_600_000,
          absoluteExpiresAt: 3_600_000,
          claims: {},
        } satisfies typeof contract.sessions.Session.Encoded;

        const entered = yield* Deferred.make<void>();
        const stale = yield* Deferred.make<void>();
        const replacement = yield* Deferred.make<void>();
        let phase: "initial" | "pending" | "replacement" | "signed-out" = "initial";
        let calls = 0;

        const http = HttpClient.make((request) =>
          Effect.gen(function* () {
            calls++;
            const started = phase;

            if (started === "pending") {
              yield* Deferred.succeed(entered, undefined);
              yield* Deferred.await(stale);
            } else if (started === "replacement") yield* Deferred.await(replacement);

            return HttpClientResponse.fromWeb(
              request,
              Response.json({
                _tag: "Success",
                value:
                  started === "signed-out"
                    ? null
                    : { ...session, subjectId: started === "replacement" ? "other" : "member" },
              }),
            );
          }),
        );

        const AppClient = Client.make(contract, { baseUrl: "https://example.test" });

        const auth = AuthAtom.make(AppClient, {
          layer: AppClient.layer.pipe(Layer.provide(Layer.succeed(HttpClient.HttpClient, http))),
        });

        const registry = yield* Effect.acquireRelease(
          Effect.sync(() => AtomRegistry.make()),
          (value) => Effect.sync(() => value.dispose()),
        );

        const context = yield* AtomRegistry.getResult(registry, auth.runtime);
        const lifetime = Context.get(context, AuthAtom.AuthAtomLifetime);
        const finalized: Array<string | null> = [];

        const account = auth.runtime.atom(
          Effect.gen(function* () {
            const { subject } = yield* lifetime.get;

            yield* Effect.addFinalizer(() => Effect.sync(() => void finalized.push(subject)));

            return subject;
          }),
        );

        const workflowEntered = yield* Deferred.make<void>();

        const workflow = auth.runtime.fn<void>()(() =>
          Deferred.succeed(workflowEntered, undefined).pipe(Effect.andThen(Effect.never)),
        );

        yield* AtomRegistry.mount(registry, account);
        expect(yield* AtomRegistry.getResult(registry, account)).toBe(null);
        yield* AtomRegistry.mount(registry, workflow);
        registry.set(workflow, undefined);
        yield* Deferred.await(workflowEntered);
        yield* AtomRegistry.mount(registry, auth.discover);
        expect((yield* AtomRegistry.getResult(registry, auth.discover))?.subjectId).toBe("member");
        expect(calls).toBe(1);
        expect(finalized).toEqual([null]);
        expect(registry.get(workflow)).toMatchObject({ _tag: "Failure", waiting: false });
        expect(yield* AtomRegistry.getResult(registry, account)).toBe("member");

        phase = "pending";
        registry.refresh(auth.discover);
        yield* Deferred.await(entered);
        phase = "replacement";
        yield* lifetime.replaceSubject(AuthSchema.SubjectId.make("other"));
        expect(registry.get(auth.discover)).toMatchObject({ _tag: "Initial" });
        yield* Deferred.succeed(stale, undefined);
        expect(AsyncResult.value(registry.get(auth.discover))._tag).toBe("None");
        yield* Deferred.succeed(replacement, undefined);
        expect(
          (yield* AtomRegistry.getResult(registry, auth.discover, { suspendOnWaiting: true }))
            ?.subjectId,
        ).toBe("other");
        expect(yield* lifetime.get).toMatchObject({ subject: "other", generation: 2 });
        expect(finalized).toEqual([null, "member"]);
        expect(calls).toBe(3);

        phase = "signed-out";
        yield* lifetime.replaceSubject(null);
        expect(AsyncResult.value(registry.get(auth.discover))).not.toMatchObject({
          _tag: "Some",
          value: { subjectId: "other" },
        });
        expect(
          yield* AtomRegistry.getResult(registry, auth.discover, { suspendOnWaiting: true }),
        ).toBe(null);
        expect(calls).toBe(4);
      }),
    ),
  ));

// https://github.com/yielded-dev/auth/commit/32be91d2
// Force the scheduler gap between the caller's fence and credential admission;
// a real browser cannot reliably pause at that boundary.
test.each(["workflow", "client", "own-transition"] as const)(
  "keeps the initiating authentication generation across %s completion",
  (mode) =>
    Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const contract = AuthContract.make("test/completion-generation", {
            claims: Schema.Struct({}),
            actions: () => ({
              authenticate: AuthContract.action({
                payload: Schema.String,
                success: AuthSchema.SubjectId,
                error: Schema.String,
                mode: "mutation",
                credentials: true,
                subject: { fromSuccess: (value) => value },
              }),
            }),
          });

          let calls = 0;

          const http = HttpClient.make((request) =>
            Effect.sync(() => {
              calls++;

              return HttpClientResponse.fromWeb(
                request,
                Response.json(
                  mode === "own-transition"
                    ? { _tag: "Success", value: "signed-in" }
                    : { _tag: "Failure", error: "denied" },
                ),
              );
            }),
          );

          const AppClient = Client.make(contract, { baseUrl: "https://example.test" });
          const factory = Atom.context();

          const auth = AuthAtom.make(AppClient, {
            runtime: factory,
            layer: AppClient.layer.pipe(Layer.provide(Layer.succeed(HttpClient.HttpClient, http))),
          });

          const registry = yield* Effect.acquireRelease(
            Effect.sync(() => AtomRegistry.make()),
            (value) => Effect.sync(() => value.dispose()),
          );

          const context = yield* AtomRegistry.getResult(registry, auth.runtime);
          const lifetime = Context.get(context, AuthAtom.AuthAtomLifetime);

          const prepare = AuthAtom.workflow<string>()(
            auth.runtime,
            Effect.fnUntraced(function* (input) {
              const workflow = yield* AuthAtom.AuthAtomWorkflow;

              return yield* Effect.succeed(
                workflow.completeAuthentication(
                  contract.actions.authenticate.route,
                  input,
                  (value) => value,
                ),
              );
            }),
            { reactivityKeys: ["session"] },
          );

          const paused = yield* Deferred.make<void>();
          const dispatcher = new Scheduler.MixedScheduler().makeDispatcher();
          let intercepted = false;
          let resume: (() => void) | undefined;

          const scheduler: Scheduler.Scheduler = {
            executionMode: "async",
            shouldYield(fiber) {
              const span = Context.getOption(fiber.context, Tracer.ParentSpan);

              if (
                !intercepted &&
                Option.isSome(span) &&
                span.value._tag === "Span" &&
                span.value.name === "OperationHttpClient.completeAuthentication"
              ) {
                intercepted = true;

                return true;
              }

              return false;
            },
            makeDispatcher: () => ({
              scheduleTask(task, priority) {
                if (resume === undefined) {
                  resume = () => dispatcher.scheduleTask(task, priority);
                  Deferred.doneUnsafe(paused, Effect.void);
                } else dispatcher.scheduleTask(task, priority);
              },
              flush: () => dispatcher.flush(),
            }),
          };

          const host = factory(Layer.empty).fn<string>()(
            Effect.fnUntraced(function* (input, get) {
              const complete =
                mode === "client"
                  ? Context.get(context, AppClient).auth.authenticate(input)
                  : yield* get.setResult(prepare, input);

              return yield* mode === "own-transition"
                ? complete
                : complete.pipe(Effect.provideService(Scheduler.Scheduler, scheduler));
            }),
          );

          yield* AtomRegistry.mount(registry, host);
          registry.set(host, "proof");
          if (mode !== "own-transition") {
            yield* Deferred.await(paused);
            yield* lifetime.replaceSubject(AuthSchema.SubjectId.make("replacement"));
            resume?.();
          }

          const result = yield* AtomRegistry.getResult(registry, host, {
            suspendOnWaiting: true,
          }).pipe(Effect.result, Effect.timeout("1 second"));

          expect(calls).toBe(mode === "own-transition" ? 1 : 0);
          expect(yield* lifetime.get).toMatchObject({
            subject: mode === "own-transition" ? "signed-in" : "replacement",
            generation: 1,
          });
          expect(result).toMatchObject(
            mode === "own-transition"
              ? { _tag: "Success", success: "signed-in" }
              : {
                  _tag: "Failure",
                  failure: { _tag: "OperationHttpError", reason: "stale-response" },
                },
          );
        }),
      ),
    ),
);

// e2ca72c admitted credential requests without a deadline; a stalled response
// blocked account transitions and Scope cleanup even with an outer timeout.
it.effect("bounds credential admission without retrying and releases its request Scope", () =>
  Effect.gen(function* () {
    const entered = yield* Deferred.make<void>();
    const response = yield* Deferred.make<Response>();
    let calls = 0;
    let aborted = false;

    const AppClient = Client.make(
      AuthContract.make("test/admission-deadline", { claims: Schema.Struct({}) }),
      {
        baseUrl: "https://example.test",
      },
    );

    const httpClient = HttpClient.make((request, _url, signal) =>
      Effect.gen(function* () {
        calls++;
        signal.addEventListener(
          "abort",
          () => {
            aborted = true;
          },
          { once: true },
        );
        yield* Deferred.succeed(entered, undefined);

        return HttpClientResponse.fromWeb(request, yield* Deferred.await(response));
      }),
    );

    const fiber = yield* AppClient.make.pipe(
      Effect.flatMap(({ auth }) => auth.signOut()),
      Effect.provideService(HttpClient.HttpClient, httpClient),
      Effect.result,
      Effect.scoped,
      Effect.forkChild,
    );

    yield* Deferred.await(entered);
    yield* TestClock.adjust("30 seconds");
    const observed = fiber.pollUnsafe();

    // Release the old implementation as well, so a red assertion cannot hang cleanup.
    yield* Deferred.succeed(response, Response.json({ _tag: "Success" }));
    yield* Fiber.await(fiber);
    expect(observed).toMatchObject({
      _tag: "Success",
      value: { _tag: "Failure", failure: { _tag: "OperationHttpError", reason: "timeout" } },
    });
    expect(calls).toBe(1);
    expect(aborted).toBe(true);
  }),
);

test("latest named authentication settles after interrupted admission and failures discard previous values", () =>
  Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const authContract = AuthContract.make("test/mutation-race", {
          claims: Schema.Struct({}),
          actions: () => ({
            authenticate: AuthContract.action({
              payload: Schema.String,
              success: AuthSchema.SubjectId,
              error: Schema.String,
              mode: "mutation",
              credentials: true,
              subject: { fromSuccess: (value) => (value === "pending" ? undefined : value) },
            }),
          }),
        });

        const first = yield* Deferred.make<Response>();
        const second = yield* Deferred.make<Response>();
        const enteredFirst = yield* Deferred.make<void>();
        const enteredSecond = yield* Deferred.make<void>();
        let calls = 0;

        const AppClient = Client.make(authContract, {
          baseUrl: "https://example.test",
        });

        const httpClient = HttpClient.make((request) =>
          Effect.gen(function* () {
            calls++;
            if (calls === 1)
              return HttpClientResponse.fromWeb(
                request,
                Response.json({ _tag: "Success", value: "old-member" }),
              );
            if (calls === 2)
              return HttpClientResponse.fromWeb(
                request,
                Response.json({ _tag: "Failure", error: "denied" }),
              );
            const entered = calls === 3 ? enteredFirst : enteredSecond;
            const response = calls === 3 ? first : second;

            yield* Deferred.succeed(entered, undefined);

            return HttpClientResponse.fromWeb(request, yield* Deferred.await(response));
          }),
        );

        const auth = AuthAtom.make(AppClient, {
          layer: AppClient.layer.pipe(
            Layer.provide(Layer.succeed(HttpClient.HttpClient, httpClient)),
          ),
        });

        const r = yield* Effect.acquireRelease(
          Effect.sync(() => AtomRegistry.make()),
          (registry) => Effect.sync(() => registry.dispose()),
        );

        const result = <A, E>(
          registry: AtomRegistry.AtomRegistry,
          atom: Atom.Atom<AsyncResult.AsyncResult<A, E>>,
        ) =>
          AtomRegistry.getResult(registry, atom, { suspendOnWaiting: true }).pipe(
            Effect.timeout("1 second"),
          );

        yield* AtomRegistry.mount(r, auth.authenticate);
        r.set(auth.authenticate, "old");
        expect(yield* result(r, auth.authenticate)).toBe("old-member");
        r.set(auth.authenticate, "denied");
        expect(yield* Effect.flip(result(r, auth.authenticate))).toBe("denied");
        expect(AsyncResult.value(r.get(auth.authenticate))._tag).toBe("None");
        r.set(auth.authenticate, "first");
        yield* Deferred.await(enteredFirst);
        r.set(auth.authenticate, "second");
        yield* Deferred.succeed(first, Response.json({ _tag: "Success", value: "pending" }));
        yield* Deferred.await(enteredSecond);
        yield* Deferred.succeed(second, Response.json({ _tag: "Success", value: "new-member" }));
        expect(yield* result(r, auth.authenticate)).toBe("new-member");
      }),
    ),
  ));

test("synchronous account replacement publishes a fresh query value", () =>
  Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const contract = AuthContract.make("test/synchronous-replacement", {
          claims: Schema.Struct({}),
        });

        const AppClient = Client.make(contract, { baseUrl: "https://example.test" });
        const auth = AuthAtom.make(AppClient);

        const registry = yield* Effect.acquireRelease(
          Effect.sync(() => AtomRegistry.make()),
          (value) => Effect.sync(() => value.dispose()),
        );

        let reads = 0;

        const query = auth.runtime.atom(
          Effect.gen(function* () {
            reads++;
            if (reads === 1) {
              const lifetime = yield* AuthAtom.AuthAtomLifetime;

              yield* lifetime.replaceSubject(null);

              return "retired";
            }

            return "current";
          }),
        );

        expect(
          yield* AtomRegistry.getResult(registry, query).pipe(Effect.timeout("1 second")),
        ).toBe("current");
        expect(reads).toBe(2);
      }),
    ),
  ));
