# Browser login in Electron

Use the [SQL account app](../persistence-sql) to sign in, register, verify email,
and recover an account in the system browser. Electron keeps its own session in
encrypted local storage; only public account information reaches the renderer.

## Run

From the repository root, after `vp install`, start the account app:

```sh
vp run @yielded/example-persistence-sql#start
```

In another terminal, package the Electron app:

```sh
vp run @yielded/example-browser-login-electron#package
```

Open the generated app under `examples/browser-login-electron/out/`. Packaging
may download Electron on its first run.

- **macOS:** Open **Yielded Browser Login.app**. The packaged app declares the
  callback scheme; `electron .` cannot register it. Allow the app's Keychain
  access when prompted. Production distributions need a stable signing identity.
- **Windows:** Launch the packaged executable. For development, you can also run
  `vp run @yielded/example-browser-login-electron#start`.
- **Linux:** Install a `.desktop` entry with `Exec` pointing to the packaged
  executable followed by `%u`, and `MimeType=x-scheme-handler/dev.yielded.auth;`.
  Select it with
  `xdg-mime default <your-entry>.desktop x-scheme-handler/dev.yielded.auth`.
  GNOME Keyring or KWallet must be available; plaintext storage is unsupported.

The defaults are `http://localhost:4183/login`, client ID `electron`, and return
URL `dev.yielded.auth://callback`. Set `YIELDED_HOSTED_URL` in the main-process
environment to use another compatible backend. Finder launches do not inherit
terminal environment overrides. Each backend origin has a separate local vault.

This example uses a custom scheme. For a signed macOS app with HTTPS callbacks,
see [claimed HTTPS callback setup](../../docs/src/content/docs/reference/browser-login.md#apple-association).

## Use the app

Choose **Sign in with browser**. A fresh sign-in returns to Electron automatically
after any required authentication steps; the browser may still ask to open the
app. If you are already signed in in the browser, choose **Continue to app** to
confirm that account. The page also offers a return link if navigation is blocked.

**Use another account** first signs out the native session. Sign out in the browser
to choose a different account. Browser and native sessions are separate:
**Sign out here** affects only Electron, and closing the app preserves its session.

After reopening the app, use **Resume login** for a pending browser login, or
**Cancel login** to abandon it. Cancellation cannot close the external browser tab.

If an exchange has an uncertain outcome, try **Recover saved session** and follow
[session recovery](../../docs/src/content/docs/reference/browser-login.md#recovery)
before starting again or resetting storage. Only after reconciliation, quit the
app and reset the affected development vault at
`<Electron userData>/auth/<backend hash>/vault.bin`; leave other vaults and the
hosted account database intact.
