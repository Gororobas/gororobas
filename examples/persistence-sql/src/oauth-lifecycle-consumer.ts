import { Auth, OAuth, Operations } from "@yielded/auth";
import { Console, Effect, Redacted, Schema } from "effect";
import { SecureRandom } from "effect/crypto";
import { HttpClient, HttpClientRequest } from "effect/http";
import { SqlClient } from "effect/sql";

import { DemoActionCodes } from "./oauth-demo-actions";
import { AppAuth, callbackId, profile } from "./oauth-lifecycle-model";

export class DemoFailure extends Schema.TaggedError<DemoFailure>()("DemoFailure", {
  step: Schema.String,
}) {}

const state = (url: Redacted.Redacted<string>) =>
  Schema.decodeUnknownEffect(Schema.NonEmptyString)(
    new URL(Redacted.value(url)).searchParams.get("state"),
  );

const privateDelivery = () => {
  const credentials: Partial<Record<Operations.CredentialSlot, Redacted.Redacted<string>>> = {};

  const sink: Operations.AuthCredentialCommandSink = (commands) =>
    Effect.sync(() => {
      for (const command of commands) {
        if (command._tag === "Issue") credentials[command.slot] = command.credential;
        else delete credentials[command.slot];
      }
    });

  const call = <A, E, R>(
    effect: Effect.Effect<A, E, R>,
    invocation: Operations.AuthInvocation = Operations.guest,
  ) =>
    effect.pipe(
      Effect.provideService(Auth.AuthRequest, {
        invocation,
        credentials: { ...credentials },
        credentialCommandSink: sink,
      }),
    );

  const read = (slot: Operations.CredentialSlot) => {
    const value = credentials[slot];

    return value === undefined
      ? Effect.fail(DemoFailure.make({ step: `missing private ${slot}` }))
      : Effect.succeed(Redacted.value(value));
  };

  return { credentials, call, read };
};

/** Public Auth methods execute all transitions. This native CLI owns private
 * credential delivery; it never serializes request binders, action codes or tokens. */
export const exercise = Effect.gen(function* () {
  const auth = yield* AppAuth;
  const crypto = yield* SecureRandom.SecureRandom;
  const sql = yield* SqlClient.SqlClient;
  const actions = yield* DemoActionCodes;
  const delivery = privateDelivery();
  const runId = yield* crypto.uuidV4();

  const start = yield* delivery.call(
    auth.signIn({ provider: profile.provider, callbackId, returnTarget: "/account" }),
  );

  const complete = yield* delivery.call(
    auth.completeSignIn({
      requestBinding: yield* delivery.read("request-binding"),
      flowId: start.flowId,
      provider: profile.provider,
      callbackId,
      response: {
        _tag: "Code",
        code: "123",
        state: yield* state(start.authorizationUrl),
        scope: "activity:read_all",
      },
    }),
  );

  if (
    !("completion" in complete) ||
    complete.completion._tag !== "Authenticated" ||
    complete.connection === undefined
  )
    return yield* DemoFailure.make({ step: "sign-in and retained grant" });
  const connection = complete.connection;
  const session = yield* delivery.call(auth.requireSession);

  const caller = {
    _tag: "Authenticated" as const,
    subjectId: session.subjectId,
    sessionId: session.sessionId,
    assurance: session.assurance,
  };

  const sessionToken = delivery.credentials.session;

  if (sessionToken === undefined)
    return yield* DemoFailure.make({ step: "private session delivery" });
  yield* Console.log(`sign-in: subject=${session.subjectId} grant=${connection.grantId}`);

  const linkedFlow = Operations.RequestBindingFlowId.make(`link-${runId}`);
  const linkedCommand = OAuth.OAuthCommandId.make(`link-${runId}`);

  const begin = yield* delivery.call(
    auth.linkAccount("accounts", {
      flowId: linkedFlow,
      provider: profile.provider,
      callbackId,
      returnTarget: "/account",
      actionProof: Redacted.value(yield* actions.issue("link-begin", linkedCommand)),
    }),
    caller,
  );

  // A different upstream identity is linked, without changing the original sign-in identity.
  const linked = yield* delivery.call(
    auth.completeAccountLink("accounts", {
      requestBinding: yield* delivery.read("request-binding"),
      flowId: linkedFlow,
      provider: profile.provider,
      callbackId,
      response: {
        _tag: "Code",
        code: "456",
        state: yield* state(begin.authorizationUrl),
        scope: "activity:read_all",
      },
    }),
    caller,
  );

  if (linked._tag !== "Linked") return yield* DemoFailure.make({ step: "link completion" });

  const afterLink = yield* delivery.call(auth.requireSession, caller);

  const [authority] =
    yield* sql`SELECT "securityRevision" FROM oauth_subject WHERE id = ${session.subjectId}`;

  if (
    afterLink.sessionId !== session.sessionId ||
    delivery.credentials.session !== sessionToken ||
    authority?.securityRevision !== session.securityRevision
  )
    return yield* DemoFailure.make({ step: "link preserves session and security revision" });

  const firstPage = yield* delivery.call(auth.listLinkedAccounts({ limit: 1 }), caller);

  if (firstPage.items.length !== 1 || firstPage.cursor === undefined)
    return yield* DemoFailure.make({ step: "linked login first page" });

  const secondPage = yield* delivery.call(
    auth.listLinkedAccounts({ limit: 1, cursor: firstPage.cursor }),
    caller,
  );

  const links = [...firstPage.items, ...secondPage.items];

  if (
    secondPage.items.length !== 1 ||
    secondPage.cursor !== undefined ||
    new Set(links.map((item) => item.credentialId)).size !== 2 ||
    !links.some((item) => item.credentialId === linked.credentialId && item.subject === "456")
  )
    return yield* DemoFailure.make({ step: "linked login pagination" });

  const inventoryJson = yield* Schema.encodeEffect(
    Schema.fromJsonString(Schema.Array(OAuth.OAuthLinkedAccount)),
  )(links);

  yield* Console.log(`listLinkedAccounts: ${inventoryJson}; pages=2; final cursor absent`);

  const listed = yield* delivery.call(auth.listAccountConnections({ limit: 20 }), caller);

  if (!listed.items.some((item) => item.grantId === connection.grantId))
    return yield* DemoFailure.make({ step: "retained grant list after linking" });
  yield* Console.log(`listAccountConnections: ${listed.items.length} retained grant(s)`);

  const unlinkCommand = OAuth.OAuthCommandId.make(`unlink-${runId}`);

  const unlinkInput = {
    commandId: unlinkCommand,
    credentialId: linked.credentialId,
    actionProof: Redacted.value(yield* actions.issue("unlink", unlinkCommand)),
  };

  yield* delivery.call(auth.unlinkAccount("accounts", unlinkInput), caller);

  // A missing credential is not evidence of a previous unlink by this caller.
  const replay = yield* delivery
    .call(auth.unlinkAccount("accounts", unlinkInput), caller)
    .pipe(Effect.result);

  if (replay._tag !== "Failure" || replay.failure._tag !== "OAuthRejected")
    return yield* DemoFailure.make({ step: "unlink replay rejected" });

  const remaining = yield* delivery.call(auth.listLinkedAccounts({ limit: 20 }), caller);

  if (remaining.items.length !== 1 || remaining.items[0]?.subject !== "123")
    return yield* DemoFailure.make({ step: "unlink" });
  yield* Console.log(
    `unlink: active login links=${remaining.items.length}; removed credential replay rejected`,
  );

  const otherDelivery = privateDelivery();

  const registrationStart = yield* otherDelivery.call(
    auth.signIn("registration", {
      provider: profile.provider,
      callbackId,
      returnTarget: "/account",
    }),
  );

  // Generate an unused numeric provider ID, so repeated runs demonstrate new registration.
  const externalId = String(yield* crypto.intBetween(1_000_000, 2_000_000_000));

  const registrationRequired = yield* otherDelivery.call(
    auth.completeSignIn("registration", {
      requestBinding: yield* otherDelivery.read("request-binding"),
      flowId: registrationStart.flowId,
      provider: profile.provider,
      callbackId,
      response: {
        _tag: "Code",
        code: externalId,
        state: yield* state(registrationStart.authorizationUrl),
        scope: "activity:read_all",
      },
    }),
  );

  if (!("_tag" in registrationRequired) || registrationRequired._tag !== "RegistrationRequired")
    return yield* DemoFailure.make({ step: "registration intent" });

  const registrationInput = {
    requestBinding: yield* otherDelivery.read("request-binding"),
    credential: yield* otherDelivery.read("registration"),
    flowId: registrationStart.flowId,
    reference: registrationRequired.reference,
    commandId: `registration-${runId}`,
    registration: { displayName: "SQL OAuth demo" },
  };

  const registered = yield* otherDelivery.call(auth.register("registration", registrationInput));
  const repeated = yield* otherDelivery.call(auth.register("registration", registrationInput));

  if (repeated._tag !== "RegistrationAccepted" || otherDelivery.credentials.session !== undefined)
    return yield* DemoFailure.make({ step: "registration outcome replay without session" });

  const changed = yield* otherDelivery
    .call(
      auth.register("registration", {
        ...registrationInput,
        registration: { displayName: "changed" },
      }),
    )
    .pipe(Effect.result);

  if (changed._tag !== "Failure" || changed.failure._tag !== "IdentityConflict")
    return yield* DemoFailure.make({ step: "registration rejects changed payload" });

  if (registered._tag !== "RegistrationAccepted")
    return yield* DemoFailure.make({ step: "registration" });

  const [registeredOwner] =
    yield* sql`SELECT "subjectId" FROM oauth_identity WHERE "externalSubject" = ${externalId}`;

  if (registeredOwner === undefined)
    return yield* DemoFailure.make({ step: "registered subject and identity commit" });
  yield* Console.log(
    `registration: subject=${yield* Schema.decodeUnknownEffect(Schema.String)(registeredOwner.subjectId)}`,
  );

  const registeredSignIn = yield* otherDelivery.call(
    auth.signIn("registration", {
      provider: profile.provider,
      callbackId,
      returnTarget: "/account",
    }),
  );

  const registeredSession = yield* otherDelivery.call(
    auth.completeSignIn("registration", {
      flowId: registeredSignIn.flowId,
      provider: profile.provider,
      callbackId,
      requestBinding: yield* otherDelivery.read("request-binding"),
      response: {
        _tag: "Code",
        code: externalId,
        state: yield* state(registeredSignIn.authorizationUrl),
        scope: "activity:read_all",
      },
    }),
  );

  if (!("completion" in registeredSession) || registeredSession.completion._tag !== "Authenticated")
    return yield* DemoFailure.make({ step: "registered user sign-in" });
  yield* Console.log(
    `registered sign-in: subject=${registeredSession.completion.session.subjectId}`,
  );

  return { caller, connection, sessionToken };
});

/** Run after closing and reopening the SQL client, using the privately retained
 * session credential and the original grant ID. No provider code exchange occurs. */
export const reopen = Effect.fnUntraced(function* (saved: Effect.Success<typeof exercise>) {
  const auth = yield* AppAuth;

  const call: Auth.AuthRequest["Service"] = {
    invocation: Operations.guest,
    credentials: { session: saved.sessionToken },
    credentialCommandSink: () => Effect.void,
  };

  const session = yield* auth.requireSession.pipe(Effect.provideService(Auth.AuthRequest, call));

  const caller = { ...saved.caller, subjectId: session.subjectId, assurance: session.assurance };

  const listed = yield* auth
    .listAccountConnections({ limit: 20 })
    .pipe(Effect.provideService(Auth.AuthRequest, { ...call, invocation: caller }));

  if (!listed.items.some((item) => item.grantId === saved.connection.grantId))
    return yield* DemoFailure.make({ step: "grant survived database reopen" });
  const access = yield* AppAuth.strategies.oauth.access.ConnectedAccess;
  const http = yield* HttpClient.HttpClient;

  const id = yield* access.withAccessToken(caller, saved.connection, (token) =>
    http
      .execute(
        HttpClientRequest.get("https://www.strava.com/api/v3/athlete").pipe(
          HttpClientRequest.bearerToken(token),
        ),
      )
      .pipe(
        Effect.flatMap((response) => response.json),
        Effect.flatMap(Schema.decodeUnknownEffect(Schema.Struct({ id: Schema.Int }))),
      ),
  );

  if (id.id !== 123) return yield* DemoFailure.make({ step: "decrypted grant token use" });
  yield* Console.log(
    `reopen: grant=${saved.connection.grantId}; native provider API token use athlete=${id.id}`,
  );
});
