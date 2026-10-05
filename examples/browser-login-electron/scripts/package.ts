import { BunRuntime, BunServices } from "@effect/platform-bun";
import { packager } from "@electron/packager";
import { Effect, FileSystem, Path, Schema } from "effect";
import electronPackage from "electron/package.json" with { type: "json" };

class PackagingError extends Schema.TaggedError<PackagingError>()("PackagingError", {
  cause: Schema.Defect(),
}) {}

const program = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const staging = yield* fs.makeTempDirectoryScoped({ prefix: "yielded-electron-" });

  yield* fs.copy(path.resolve("dist"), path.join(staging, "dist"));
  yield* fs.writeFileString(
    path.join(staging, "package.json"),
    '{"name":"yielded-browser-login","version":"0.0.0","main":"dist/main.cjs"}\n',
  );

  const outputs = yield* Effect.tryPromise({
    try: () =>
      packager({
        dir: staging,
        out: path.resolve("out"),
        name: "Yielded Browser Login",
        executableName: "yielded-browser-login",
        appBundleId: "dev.yielded.auth.electron",
        electronVersion: electronPackage.version,
        protocols: [{ name: "Yielded Auth callback", schemes: ["dev.yielded.auth"] }],
        prune: false,
        overwrite: true,
        asar: true,
      }),
    catch: (cause) => PackagingError.make({ cause }),
  });

  yield* Effect.logInfo(outputs.join("\n"));
});

BunRuntime.runMain(program.pipe(Effect.scoped, Effect.provide(BunServices.layer)));
