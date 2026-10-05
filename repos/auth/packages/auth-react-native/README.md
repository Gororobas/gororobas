# @yielded/auth-react-native

Client-local iOS passkeys and browser login for `@yielded/auth`. Applications own
authentication workflows, HTTP, sessions, and native application configuration.
Core has no React Native dependency. Passkeys require iOS 16+; browser login's
minimum depends on the chosen Expo SDK. Android is unsupported.

Import the package root for passkeys, or `@yielded/auth-react-native/BrowserLogin`
for browser login. Install only the optional native peers for the entrypoint you
use, autolink with CocoaPods, and rebuild the application.

## Passkeys

Import `* as ReactNativePasskey` from this package and construct the adapter with
`ReactNativePasskey.make()`, or provide `ReactNativePasskey.layer`.

Install this package and its `react-native` and `react-native-passkey` peers only
in the native application. `@yielded/auth` does not depend on React Native or
this adapter. The adapter consumes core's public passkey schemas and returns the
same flow IDs and redacted completion responses as the browser adapter.

Applications own begin → prompt → complete, HTTP, binding, persistence, sessions,
and associated domains. Registration creates ES256 platform passkeys; authentication
also supports existing security-key credentials. iOS 16+ is supported; Android and
conditional mediation are unsupported. Interruption discards delivery but cannot dismiss the system
prompt, and the shared busy guard stays held until the native promise settles.

See the [iOS setup guide](../../docs/src/content/docs/guide/passkeys.md#prompt-in-an-ios-react-native-app)
and [API reference](../../docs/src/content/docs/reference/passkey-react-native.md).

## Browser login

Open your hosted sign-in page with Expo WebBrowser and keep the native session in
Expo SecureStore. See the [browser-login guide](../../docs/src/content/docs/guide/browser-login.mdx)
for the shared client, server policy, and recovery flow.

Install the peers matching your Expo SDK:

| Expo SDK | `expo-web-browser` | `expo-secure-store` | Minimum iOS |
| -------- | ------------------ | ------------------- | ----------- |
| 54       | `~15.0.11`         | `~15.0.8`           | 16          |
| 57       | `~57.0.3`          | `~57.0.4`           | 16.4        |

For SDK 54:

```sh
bun add @yielded/auth-react-native@beta effect expo-web-browser@~15.0.11 expo-secure-store@~15.0.8 react-native-url-polyfill
```

Plain React Native apps must first [install Expo Modules](https://docs.expo.dev/bare/installing-expo-modules/).
Rebuild the native app after installing the peers.

Load the required [WHATWG URL polyfill](https://github.com/charpeni/react-native-url-polyfill)
in your application entrypoint before any auth imports:

```ts
import "react-native-url-polyfill/auto";
import "./app";
```

Supply core's `BrowserLogin.Browser` and `BrowserLogin.Vault` with separate Layers:

```ts
import { Layer } from "effect";
import * as NativeBrowserLogin from "@yielded/auth-react-native/BrowserLogin";

export const NativeLoginLive = Layer.merge(
  NativeBrowserLogin.layerBrowser,
  NativeBrowserLogin.layerVault({ service: "com.example.app.auth.production" }),
);
```

Create one vault Layer per authentication lifetime and share it with
`BrowserLogin.makeClient` and your native HTTP client's credentials service.
Choose a dedicated `service` per app, server environment, and client ID; keep it
stable across restarts and allow no other writers. Storage is device-only,
available while unlocked, and does not use biometric gating. Keychain data can
survive app deletion.

Your app also supplies `Crypto.Crypto` with cryptographically secure random bytes
and SHA-256. React Native does not supply browser `SubtleCrypto`.
With [`expo-crypto`](https://docs.expo.dev/versions/v54.0.0/sdk/crypto/), use
`getRandomValues` and `digest`; `getRandomBytes` can fall back to `Math.random`
in development.

The hosted page must use HTTPS. For a custom callback, register a reverse-domain
scheme in `CFBundleURLTypes` and the exact return URL, such as
`com.example.app://auth/callback`, with your server.

HTTPS callbacks require iOS 17.4+ and a signed `webcredentials:<callback-host>`
[Associated Domains entitlement](https://developer.apple.com/documentation/xcode/supporting-associated-domains).
The host's `apple-app-site-association` file must list the app's `PREFIX.bundleID`
under `webcredentials.apps`. Register the exact callback URL on the server; app IDs
belong to your association setup. The optional
[association helper](../../docs/src/content/docs/reference/browser-login.md#apple-association)
contributes paths to your app-owned file. Older iOS versions reject HTTPS callbacks.

Let this adapter own the authentication session: do not open a competing
WebBrowser session or handle its callback through `Linking`. On SDK 54, a failed
presentation can stay pending; interrupt login before trying again.
