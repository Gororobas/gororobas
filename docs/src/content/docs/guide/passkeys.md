---
title: Passkeys
description: Begin a passkey ceremony, prompt in a browser or iOS app, and verify the response.
---

Passkey sign-in has three steps: create a challenge, prompt the authenticator,
and verify its response. The client adapter owns only the prompt; the server
verifies the proof and issues the session. Your application supplies relying-party
configuration, storage, and account policy.

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

```ts
const auth = yield* AppAuth;
const started = yield* auth.signIn({ flowId, commandId, profileId: "default" });
```

Return the challenge to the browser. The request-binding credential is delivered
privately; keep it associated with this flow.

## Ask the browser to authenticate

Inside a scoped browser Effect, use the public `started` result:

```ts
import * as PasskeyBrowser from "@yielded/auth-simplewebauthn/Browser";

const browser = yield* PasskeyBrowser.make();
const assertion = yield* browser.authenticate({ started, mediation: "required" });
```

Keep the Effect's Scope open for the ceremony. Interrupting it cancels that
ceremony. Import `PasskeyBrowser` only in the browser; it requires
`@simplewebauthn/browser`.

## Complete sign-in on the server

```ts
const auth = yield* AppAuth;
const result = yield* auth.completeSignIn({ flowId, response });
```

Here `response` is `Redacted.value(assertion.response)` from the browser ceremony,
with `Redacted` imported from `effect`. Send it through the protected transport;
the server injects the original request-binding cookie. Only `Authenticated`
grants access; complete any required additional factor first. If session issuance
fails after the challenge is consumed, begin a new ceremony.

The client exposes the same calls as `client.auth.signIn(...)` and
`client.auth.completeSignIn(...)`. The [Atom workflow](./client#compose-a-passkey-workflow)
connects these steps.

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
ID and exact allowed origins. Changing the RP ID can make existing passkeys unusable.

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

`PasskeyPersistenceLive` provides ceremony and credential storage through
[the passkey adapters](../reference/adapters#passkeys). `AuthDependencies` supplies
shared [crypto, session, account, and key configuration](../reference/adapters#compose-the-application-layer).

Admission defaults to process-local limits. [Share subject and target limits](./passwords#share-rate-limits)
across replicas or per-request runtimes; the global budget stays per instance.

## Registration and management

| Task                                   | Strategy and methods                                                        |
| -------------------------------------- | --------------------------------------------------------------------------- |
| Create an account with a passkey       | `Passkey.makeRegistration` → `register`, `completeRegistration`.            |
| Add, list, rename, or remove a passkey | `Passkey.makeManagement` and its authenticated operations.                  |
| Confirm a protected password change    | Authorize it with recent passkey evidence through `PasswordActionEvidence`. |

Registration requires application-owned provisioning. It must not silently become
sign-in or link an existing account. See [passkey persistence](../reference/adapters#passkeys)
for transaction ownership.

`PasskeyActionEvidence` authorizes enrollment and removal. Choose a freshness
policy, bounded by `management.maximumEvidenceAgeMillis`; a valid session alone
does not establish recent authentication. Enrollment takes evidence at begin and
rechecks it at completion, without a second action proof.

Adding a passkey preserves existing sessions without refreshing authentication
time or assurance. Removal invalidates authentication and protects the last usable
sign-in method. `requireImmediateInvalidation` applies to removal; enrollment and
metadata operations can use stateless sessions.

The [managed app](https://github.com/yielded-dev/auth/tree/main/examples/persistence-drizzle-managed)
shows enrollment, a saved-key list, and sign-in with Effect Atom. Its policy requires
authentication within the last five minutes for enrollment, not for ordinary
session reads. See [password changes](./passwords#change-a-password) for using
passkey evidence to authorize another action.

## Prompt in an iOS React Native app

Install `@yielded/auth-react-native` with its `react-native-passkey` peer in your
native workspace, install the peer's CocoaPods, and rebuild the app. The adapter
supports iOS 16+; Expo requires a native build, not Expo Go. Initialize Effect's
runtime prerequisites, including `TextEncoder` and `TextDecoder` if Hermes lacks
them, before importing Effect or the adapter. It installs no global polyfills.

```ts
import * as ReactNativePasskey from "@yielded/auth-react-native";

const native = yield* ReactNativePasskey.make();
const assertion = yield* native.authenticate({ started, mediation: "required" });
```

Use `native.register(registrationStarted)` for registration or enrollment.
Both adapters accept the same started values and return `{ flowId, response }`,
with a redacted response. Keep begin → prompt → complete in one Effect Atom
workflow, and keep native imports out of shared contracts and server modules.

Native registration creates platform passkeys and requires ES256 (`alg: -7`).
A nonempty `excludeCredentials` list requires iOS 17.4+. Android and conditional
mediation are unsupported.
Interruption stops response delivery but cannot dismiss the system prompt; the
adapter stays busy until it settles. Do not automatically retry registration,
because a local failure does not prove that no credential was created. See the
[iOS adapter reference](../reference/passkey-react-native.md) for capabilities and errors.

### Associate the signed app with the relying party

1. Enable **Associated Domains** for the iOS app ID, provisioning profile, and app
   target. Add `webcredentials:app.example.com`, using your relying-party domain.
2. Serve this JSON at `https://app.example.com/.well-known/apple-app-site-association`
   over TLS without a redirect. Replace the identifier with the signed app's
   application-identifier prefix (usually the Team ID) and bundle ID.

   ```json
   { "webcredentials": { "apps": ["ABCDE12345.com.example.app"] } }
   ```

3. Rebuild the signed app after changing entitlements. Account for Apple's
   association caching, and enable iCloud Keychain and a device passcode.

Keep the verifier's exact origin allowlist, user-verification, and resident-key
requirements; the server remains authoritative. Check the actual client-data origin
from the signed app against your configuration. An HTTPS API host alone does not
establish domain association. See Apple's [associated-domain setup](https://developer.apple.com/documentation/xcode/supporting-associated-domains)
and [passkey requirements](https://developer.apple.com/documentation/authenticationservices/supporting-passkeys).
