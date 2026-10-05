---
title: Passkeys
description: Begin a passkey ceremony, prompt in a browser or iOS app, and verify the response.
---

Passkey sign-in has three steps: create the challenge on your server, ask the
browser or iOS app to authenticate, and verify the response on your server.
The client adapter owns only the local prompt. Your application owns transport,
request binding, single-use challenges, credential storage, and session issuance.

## Define the shared actions

<!-- #region passkey-contract -->

```ts title="packages/domain/passkey-contract.ts"
import { Schema } from "effect";
import { AuthContract, PasskeyContract } from "@yielded/auth";

export const PasskeyApi = AuthContract.make("app/Auth", {
  claims: Schema.Struct({ displayName: Schema.String }),
  actions: (sessions) => {
    const passkey = PasskeyContract.make("app/Auth/passkey", sessions);

    return {
      signIn: AuthContract.fromOperation(passkey.operations.Begin, { strategy: "passkey" }),
      completeSignIn: AuthContract.fromOperation(passkey.operations.Complete, {
        strategy: "passkey",
        requestFields: { bindingCredential: "request-binding" },
        subject: {
          fromSuccess: (result) =>
            result._tag === "Authenticated" ? result.session.subjectId : undefined,
        },
      }),
    };
  },
});
```

<!-- #endregion passkey-contract -->

`requestFields` supplies the private request binder from the HTTP request. Neither
the named server call nor the browser payload includes that credential. The
`subject` projection lets the client publish an account change after authentication.

## Enable passkeys

```ts title="apps/server/auth.ts"
import { Auth, Passkey, Sessions } from "@yielded/auth";

import { PasskeyApi } from "@app/domain/passkey-contract";

export const AppAuth = Auth.make(PasskeyApi, {
  sessions: Sessions.stateful(),
  strategies: {
    passkey: Passkey.make(),
  },
  defaultStrategy: "passkey",
});
```

Supply the relying-party configuration once through `PasskeyConfig`, below.

## Begin sign-in on the server

Inside an existing Effect handler, with `AppAuth` provided and the HTTP request
boundary in place:

<!-- prettier-ignore -->
```ts
const auth = yield* AppAuth;
const started = yield* auth.signIn({ flowId, commandId, profileId: "default" });
```

Return the challenge to the browser. The request-binding credential is delivered
privately; keep it associated with this flow.

## Ask the browser to authenticate

Inside a scoped browser Effect, use the public `started` result:

<!-- prettier-ignore -->
```ts
import * as PasskeyBrowser from "@yielded/auth-simplewebauthn/Browser";

const browser = yield* PasskeyBrowser.make();
const assertion = yield* browser.authenticate({ started, mediation: "required" });
```

Keep the Effect's Scope open for the ceremony. Interrupting it cancels that
ceremony. Import `PasskeyBrowser` only in the browser; it requires
`@simplewebauthn/browser`.

## Prompt in an iOS React Native app

Install `@yielded/auth-react-native` and `react-native-passkey@~3.6.2` only in the
native workspace of a React Native 0.81+ application. The core `@yielded/auth`
package has no React Native dependency. Install the peer's CocoaPods and rebuild the native app. Expo apps need a development or production
native build; Expo Go cannot load this module. The adapter supports iOS 16+ only.
Initialize the application's Effect runtime prerequisites, including `TextEncoder`
and `TextDecoder` when absent in Hermes, before importing Effect or this adapter.
The adapter does not install global polyfills.

Registration creates platform passkeys and requires ES256 (`alg: -7`) in
`pubKeyCredParams`. Authentication also supports existing security-key credentials.
Registration with a nonempty `excludeCredentials` list requires iOS 17.4+, where
the peer can forward exclusions. Unsupported registration algorithms, Android,
and conditional mediation return `PasskeyReactNativeUnsupported` before prompting.

<!-- prettier-ignore -->
```ts
import * as ReactNativePasskey from "@yielded/auth-react-native";

const native = yield* ReactNativePasskey.make();
const capabilities = yield* native.capabilities;
const assertion = yield* native.authenticate({ started, mediation: "required" });
// For registration or enrollment: yield* native.register(registrationStarted).
```

Alternatively, provide `ReactNativePasskey.layer` and yield the
`ReactNativePasskey.PasskeyReactNative` service. Both methods take the same started
values as the browser adapter and return `{ flowId, response }`, with `response`
redacted. Keep begin → prompt → complete in
one Effect Atom workflow; React only dispatches it. Choose the platform adapter at
the native/browser entrypoint, keeping native imports out of shared contracts and
server modules. These adapters work with application-owned endpoints as well as
the named Auth client.

Interruption stops response delivery but **cannot dismiss the system prompt**.
The adapter stays busy until the native request settles, including after timeout.
Do not automatically retry registration: a local failure does not prove that no
credential was created. See the [iOS adapter reference](../reference/passkey-react-native.md)
for capabilities, typed failures, and concurrency limits.

### Associate the signed app with the relying party

1. Enable **Associated Domains** for the iOS app ID, provisioning profile, and app
   target. Add `webcredentials:app.example.com` to the entitlement, using the exact
   relying-party domain from your server configuration.
2. Serve the following JSON at
   `https://app.example.com/.well-known/apple-app-site-association`, with a valid
   TLS certificate and no redirect. Replace the identifier with the signed app's
   application-identifier prefix (usually the Team ID) and bundle ID.

   ```json
   { "webcredentials": { "apps": ["ABCDE12345.com.example.app"] } }
   ```

3. Rebuild/install the signed app after changing entitlements. Account for Apple's
   association caching. Enable iCloud Keychain and a device passcode for the
   platform passkey journey. See Apple's [associated-domain setup](https://developer.apple.com/documentation/xcode/supporting-associated-domains)
   and [passkey requirements](https://developer.apple.com/documentation/authenticationservices/supporting-passkeys).

Keep the verifier's exact origin allowlist and UV/resident-key requirements. The
adapter forwards server policy and leaves native `clientDataJSON` unchanged;
the server remains authoritative for challenge, origin, RP ID, UV, and signatures.
An HTTPS API host alone does not establish the app's domain association.

Before shipping, prove registration and authentication from the signed app against
the real associated domain and verifier, including the actual client-data origin.
Also dismiss a prompt and interrupt a pending workflow to verify the UI's recovery
behavior. A capability check, simulator, or successful package build does not prove
signed-device/domain configuration. HTTP, entitlements, AASA hosting, and UI remain
application-owned.

## Complete sign-in on the server

<!-- prettier-ignore -->
```ts
const auth = yield* AppAuth;
const result = yield* auth.completeSignIn({ flowId, response });
```

Here `response` is the serialized string obtained from
`Redacted.value(assertion.response)` in the browser ceremony above, with `Redacted`
imported from `effect`. Send it through the protected transport; the server injects
the original request-binding cookie. A session
is issued only after server verification and the current account checks succeed.
The client exposes the same calls as `client.auth.signIn(...)` and
`client.auth.completeSignIn(...)`. The
[Atom workflow](./client#compose-a-passkey-workflow) connects these steps.

## Install the server verifier

```ts title="apps/server/passkey-protocol.ts"
import { Layer } from "effect";
import { Passkey } from "@yielded/auth";
import * as PasskeyServer from "@yielded/auth-simplewebauthn/Server";

export const PasskeyConfigLive = Passkey.PasskeyConfig.layer({
  id: "app.example.com",
  name: "My app",
  origins: ["https://app.example.com"],
});

export const PasskeyProtocolLive = PasskeyServer.layer.pipe(Layer.provide(PasskeyConfigLive));
```

Install `@yielded/auth-simplewebauthn` and its `@simplewebauthn/server` peer.
Both the strategy and verifier require `PasskeyConfig`. Use your actual relying-party
ID and exact allowed origins; changing them can make existing passkeys unusable.

## Supply the services

The verifier is an optional adapter; storage and claims have no automatic defaults:

```ts title="apps/server/passkey-live.ts"
import { Layer } from "effect";

import { AppAuth } from "./auth";
import { AuthDependencies } from "./auth-dependencies";
import { resolvePasskeyClaims } from "./auth-accounts";
import { PasskeyPersistenceLive } from "./auth-persistence";
import { PasskeyConfigLive, PasskeyProtocolLive } from "./passkey-protocol";

export const PasskeyLive = Layer.mergeAll(
  PasskeyPersistenceLive,
  PasskeyConfigLive,
  PasskeyProtocolLive,
  Layer.succeed(AppAuth.strategies.passkey.SessionClaims, { resolve: resolvePasskeyClaims }),
);

export const AuthLive = AppAuth.layer.pipe(
  Layer.provide(PasskeyLive),
  Layer.provide(AuthDependencies),
);
```

The relative imports are your application modules. `PasskeyPersistenceLive`
provides ceremony and credential storage through [the passkey adapters](../reference/adapters#passkeys).
`AuthDependencies` provides shared [session, account, and key configuration](../reference/adapters#compose-the-application-layer).
The method supplies its default policy, Web Crypto, and empty hooks.

## Registration and management

| Task                                   | Strategy and methods                                                 |
| -------------------------------------- | -------------------------------------------------------------------- |
| Create an account with a passkey       | `Passkey.makeRegistration` → `register`, `completeRegistration`.     |
| Add, list, rename, or remove a passkey | `Passkey.makeManagement` and its authenticated operations.           |
| Confirm a protected password change    | `PasskeyPassword` binds the assertion to a prepared password intent. |

These require explicit application authority. A registration ceremony must not
silently become a login ceremony or link an existing account. See
[passkey persistence](../reference/adapters#passkeys) for transaction ownership.

`PasskeyActionEvidence` supplies authorization for enrollment and removal. The
application chooses its freshness requirement; `management.maximumEvidenceAgeMillis`
sets a finite upper bound, and individual action requirements can be stricter.
Choose a short window, such as five minutes, for adding a credential; session
validity alone does not establish recent authentication. Adding a
passkey preserves existing sessions without refreshing their authentication time or
adding assurance. Removal still invalidates authentication and protects the last
usable sign-in method.

The [managed example](https://github.com/yielded-dev/auth/tree/main/examples/persistence-drizzle-managed)
shows enrollment from a signed-in account, a saved-key list, and passkey sign-in with
Effect Atom. Its Drizzle persistence layer derives the passkey tables from the Auth
definition. Its application policy requires authentication from the last five
minutes for enrollment and asks the user to sign in again when that evidence is
stale. Ordinary session reads and the saved-key list still accept a valid session.
