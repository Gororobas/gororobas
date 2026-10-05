import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";

import { NodeHttpClient, NodeServices } from "@effect/platform-node";
import { BrowserLogin } from "@yielded/auth";
import { BrowserLogin as ElectronLogin } from "@yielded/auth-electron";
import { Effect, Exit, Fiber, Layer, Path, Schema, Scope } from "effect";
import { app, BrowserWindow, dialog, ipcMain, net, protocol } from "electron";

import { makeHost } from "./host";
import { channel, DesktopError } from "./public";

const uiOrigin = "yielded-ui://app";
const uiUrl = `${uiOrigin}/index.html`;
const scope = Scope.makeUnsafe();

// Bundled CommonJS startup installs capture before Electron's first event-loop tick.
app.setName("Yielded Browser Login");
protocol.registerSchemesAsPrivileged([
  { scheme: "yielded-ui", privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);

const startup = Effect.gen(function* () {
  const hostedUrl = yield* Schema.decodeUnknownEffect(BrowserLogin.HostedUrl)(
    process.env.YIELDED_HOSTED_URL ?? "http://localhost:4183/login",
  );

  const browser = yield* ElectronLogin.makeBrowser({
    hostedUrl,
    returnUrl: "dev.yielded.auth://callback",
  });

  return { browser, hostedUrl };
});

const launch = (config: Effect.Success<typeof startup>) =>
  Effect.gen(function* () {
    const { join } = yield* Path.Path;
    const runPromise = Effect.runPromiseWith(yield* Effect.context<never>());

    const vaultNamespace = createHash("sha256")
      .update(`electron\n${new URL(config.hostedUrl).origin}\ndev.yielded.auth://callback`)
      .digest("hex");

    yield* Effect.tryPromise({
      try: () => app.whenReady(),
      catch: () => DesktopError.make({ reason: "unavailable" }),
    });

    const services = yield* Layer.buildWithScope(
      Layer.mergeAll(
        Layer.succeed(BrowserLogin.Browser, config.browser),
        ElectronLogin.layerVault({
          path: join(app.getPath("userData"), "auth", vaultNamespace, "vault.bin"),
        }),
        // No browser fetch metadata, cookie jar or automatic redirect following.
        NodeHttpClient.layerNodeHttp,
      ),
      scope,
    );

    const invoke = yield* makeHost(config.hostedUrl).pipe(Effect.provideContext(services));

    const window = yield* Effect.acquireRelease(
      Effect.sync(
        () =>
          new BrowserWindow({
            width: 720,
            height: 640,
            webPreferences: {
              preload: join(__dirname, "preload.cjs"),
              contextIsolation: true,
              sandbox: true,
              nodeIntegration: false,
            },
          }),
      ),
      (window) =>
        Effect.sync(() => {
          if (!window.isDestroyed()) window.destroy();
        }),
    );

    window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    window.webContents.on("will-navigate", (event) => event.preventDefault());
    window.webContents.on("will-attach-webview", (event) => event.preventDefault());
    window.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) =>
      callback(false),
    );
    window.webContents.session.setPermissionCheckHandler(() => false);
    yield* Effect.acquireRelease(
      Effect.sync(() =>
        protocol.handle("yielded-ui", (request) => {
          const url = new URL(request.url);

          if (
            request.method !== "GET" ||
            url.protocol !== "yielded-ui:" ||
            url.host !== "app" ||
            url.username ||
            url.password ||
            url.search ||
            url.hash ||
            !/^\/(?:index\.html|assets\/[A-Za-z0-9._-]+\.(?:js|css))$/.test(url.pathname)
          )
            return new Response(null, { status: 404 });

          return net.fetch(pathToFileURL(join(__dirname, "renderer", url.pathname)).href);
        }),
      ),
      () => Effect.sync(() => protocol.unhandle("yielded-ui")),
    );
    yield* Effect.acquireRelease(
      Effect.sync(() =>
        ipcMain.handle(channel, (event, input: unknown) => {
          const frame = event.senderFrame;

          if (
            window.isDestroyed() ||
            event.sender !== window.webContents ||
            frame === null ||
            frame !== window.webContents.mainFrame ||
            frame.origin !== uiOrigin ||
            frame.url !== uiUrl
          )
            return { _tag: "Failure", error: { _tag: "DesktopError", reason: "request" } };

          return runPromise(
            Effect.gen(function* () {
              const fiber = yield* invoke(input).pipe(Effect.forkIn(scope));

              return yield* Fiber.join(fiber);
            }),
          );
        }),
      ),
      () => Effect.sync(() => ipcMain.removeHandler(channel)),
    );
    yield* Effect.tryPromise({
      try: () => window.loadURL(uiUrl),
      catch: () => DesktopError.make({ reason: "unavailable" }),
    });
  });

if (!app.requestSingleInstanceLock()) app.quit();
else {
  const stop = (event: Electron.Event) => {
    event.preventDefault();
    app.removeListener("before-quit", stop);
    void Effect.runPromise(Scope.close(scope, Exit.void)).then(() => app.quit());
  };

  app.on("before-quit", stop);
  app.on("window-all-closed", () => app.quit());
  const config = Effect.runSyncExit(startup.pipe(Effect.provideService(Scope.Scope, scope)));

  const program = Exit.isSuccess(config)
    ? launch(config.value)
    : Effect.fail(DesktopError.make({ reason: "unavailable" }));

  void Effect.runPromise(
    program.pipe(
      Effect.provide(NodeServices.layer),
      Effect.provideService(Scope.Scope, scope),
      Effect.catchCause(() =>
        Effect.sync(() => {
          dialog.showErrorBox(
            "Unable to start",
            "Secure storage or desktop setup is unavailable. See this example's README for supported launch and keychain requirements.",
          );
          app.quit();
        }),
      ),
    ),
  );
}
