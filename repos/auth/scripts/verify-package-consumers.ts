import { NodeRuntime, NodeServices } from "@effect/platform-node";
import { Console, Effect, FileSystem, Path, Schema, Stream } from "effect";
import { ChildProcess } from "effect/process";
import { build } from "esbuild";
import ts from "typescript-twoslash";
import { build as viteBuild } from "vite-plus";

import { PublishManifest, withPublishManifests } from "./release-publish.ts";

class PackageConsumerError extends Schema.TaggedError<PackageConsumerError>()(
  "PackageConsumerError",
  { message: Schema.String, cause: Schema.optionalKey(Schema.Defect()) },
) {}

const checkDeclarations = Effect.fn("packageConsumers.declarations")(function* (
  stage: string,
  entries: ReadonlyArray<string>,
) {
  const program = ts.createProgram(entries, {
    noEmit: true,
    strict: true,
    exactOptionalPropertyTypes: true,
    types: [],
    target: ts.ScriptTarget.ESNext,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
  });

  // Check our declarations as well as the consumers. Third-party declaration
  // diagnostics belong to their owners (e.g. msgpackr assumes Node globals).
  const diagnostics = [
    ...program.getOptionsDiagnostics(),
    ...program.getGlobalDiagnostics(),
    ...program
      .getSourceFiles()
      .filter((file) => file.fileName.startsWith(`${stage}/`))
      .flatMap((file) => [
        ...program.getSyntacticDiagnostics(file),
        ...program.getSemanticDiagnostics(file),
      ]),
  ];

  if (diagnostics.length > 0)
    return yield* new PackageConsumerError({
      message: ts.formatDiagnostics(diagnostics, {
        getCanonicalFileName: (file) => file,
        getCurrentDirectory: () => stage,
        getNewLine: () => "\n",
      }),
    });
});

const comparisons = [
  ["identity", "identity-root"],
  ["contracts", "contracts-root"],
  ["atom", "atom-root"],
  ["server", "server-root"],
  ["lazy", "lazy-root"],
  ["contracts", "contracts-group"],
  ["server", "server-group"],
  ["passkey", "passkey-group"],
];

const probes = [...new Set([...comparisons.flat(), "contracts-all", "root", "persistence"])];
const bundlers = ["esbuild", "vite"] as const;

type Bundler = (typeof bundlers)[number];

interface Chunk {
  readonly fileName: string;
  readonly code: string;
  readonly imports: ReadonlyArray<string>;
  readonly modules: ReadonlyArray<string>;
  readonly entry: boolean;
}

const esbuildConsumer = Effect.fn("packageConsumers.esbuild")(function* (
  stage: string,
  probe: string,
) {
  const path = yield* Path.Path;

  const result = yield* Effect.tryPromise({
    try: () =>
      build({
        absWorkingDir: stage,
        entryPoints: [`fixtures/${probe}.ts`],
        outdir: `bundles/esbuild/${probe}`,
        entryNames: "entry",
        outExtension: { ".js": ".mjs" },
        bundle: true,
        splitting: true,
        treeShaking: true,
        minify: true,
        format: "esm",
        platform: "browser",
        target: "es2022",
        write: false,
        metafile: true,
        logLevel: "silent",
      }),
    catch: (cause) =>
      new PackageConsumerError({ message: `Cannot bundle esbuild consumer ${probe}`, cause }),
  });

  const chunks: Array<Chunk> = [];

  for (const file of result.outputFiles) {
    const output = result.metafile.outputs[path.relative(stage, file.path)];

    if (output === undefined || output.imports.some((item) => item.external))
      return yield* new PackageConsumerError({
        message: `${probe} has missing metadata or external imports`,
      });
    chunks.push({
      fileName: path.basename(file.path),
      code: file.text,
      imports: output.imports
        .filter((item) => item.kind !== "dynamic-import")
        .map((item) => path.basename(item.path)),
      modules: Object.entries(output.inputs)
        .filter(([, input]) => input.bytesInOutput > 0)
        .map(([file]) => file),
      entry: output.entryPoint === `fixtures/${probe}.ts`,
    });
  }

  return chunks;
});

const viteConsumer = Effect.fn("packageConsumers.vite")(function* (stage: string, probe: string) {
  const path = yield* Path.Path;

  const result = yield* Effect.tryPromise({
    try: () =>
      viteBuild({
        configFile: false,
        root: stage,
        logLevel: "silent",
        build: {
          target: "es2022",
          minify: true,
          write: false,
          lib: { entry: path.join(stage, `fixtures/${probe}.ts`), formats: ["es"] },
          rolldownOptions: {
            output: { entryFileNames: "entry.mjs", chunkFileNames: "[name]-[hash].mjs" },
          },
        },
      }),
    catch: (cause) =>
      new PackageConsumerError({ message: `Cannot bundle Vite consumer ${probe}`, cause }),
  });

  const chunks: Array<Chunk> = [];

  for (const bundle of Array.isArray(result) ? result : [result]) {
    if (!("output" in bundle))
      return yield* new PackageConsumerError({
        message: `Vite consumer ${probe} unexpectedly started a watcher`,
      });
    for (const file of bundle.output) {
      if (file.type !== "chunk") continue;
      if (
        [...file.imports, ...file.dynamicImports].some(
          (name) => !bundle.output.some((output) => output.fileName === name),
        )
      )
        return yield* new PackageConsumerError({
          message: `Vite consumer ${probe} retained external imports`,
        });
      chunks.push({
        fileName: file.fileName,
        code: file.code,
        imports: file.imports,
        modules: Object.entries(file.modules)
          .filter(([, value]) => value.renderedLength > 0)
          .map(([file]) => file),
        entry: file.isEntry,
      });
    }
  }

  return chunks;
});

const bundleConsumer = Effect.fn("packageConsumers.bundle")(function* (
  stage: string,
  probe: string,
  bundler: Bundler,
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;

  const chunks = yield* bundler === "esbuild"
    ? esbuildConsumer(stage, probe)
    : viteConsumer(stage, probe);

  const retained = chunks.flatMap((chunk) => chunk.modules);
  const initial = new Set(chunks.filter((chunk) => chunk.entry).map((chunk) => chunk.fileName));

  if (initial.size !== 1)
    return yield* new PackageConsumerError({ message: `${bundler}/${probe} must emit one entry` });
  // Count all statically reachable chunks, not just the entry file.
  for (const name of initial) {
    for (const imported of chunks.find((chunk) => chunk.fileName === name)?.imports ?? [])
      initial.add(imported);
  }
  const implementation = (file: string) => file.split("packages/auth/dist/")[1];

  const unwanted = retained.filter((file) => {
    if (
      /(?:^|\/)(?:testing|test|fixtures)\//.test(file) &&
      !file.startsWith("fixtures/") &&
      !file.startsWith(`${stage}/fixtures/`)
    )
      return true;
    const module = implementation(file);

    // esbuild retains members of re-exported namespaces; Vite should not.
    if (
      (probe === "identity" || (probe === "identity-root" && bundler === "vite")) &&
      module !== undefined
    )
      return !["identity/codecs.mjs", "Schema.mjs"].includes(module);
    // A dynamic root import deliberately demonstrates the broad loading boundary.
    if (probe === "lazy" || /^(?:contracts|atom)(?:-root|-group|-all)?$/.test(probe))
      return /\/(?:auth|sessions|passkey|totp|oauth|email|phone|password\/methods)\/(?:module|definition|signInModule|AuthStrategy|Auth)\.mjs$|\/node_modules\/@noble\//.test(
        file,
      );

    return false;
  });

  // The direct dynamic import must keep the client out of the initial bundle.
  if (probe === "lazy") {
    const clientModule = (file: string) =>
      /\/http-operation\/(?:auth-client|client)\.mjs$/.test(file);

    if (
      chunks.some((chunk) => initial.has(chunk.fileName) && chunk.modules.some(clientModule)) ||
      !chunks.some((chunk) => !initial.has(chunk.fileName) && chunk.modules.some(clientModule))
    )
      return yield* new PackageConsumerError({
        message: `${bundler}/${probe} lost its deferred client boundary`,
      });
  }
  if (unwanted.length > 0)
    return yield* new PackageConsumerError({
      message: `${bundler}/${probe} retained unexpected dependencies: ${unwanted.join(", ")}`,
    });

  const directory = path.join(stage, "bundles", bundler, probe);

  yield* fs.makeDirectory(directory, { recursive: true });
  let initialBytes = 0;
  let deferredBytes = 0;

  for (const chunk of chunks) {
    yield* fs.writeFileString(path.join(directory, chunk.fileName), chunk.code);
    const bytes = new TextEncoder().encode(chunk.code).length;

    if (initial.has(chunk.fileName)) initialBytes += bytes;
    else deferredBytes += bytes;
  }

  return {
    probe,
    initialBytes,
    deferredBytes,
    modules: [...new Set(retained.flatMap((file) => implementation(file) ?? []))].sort(),
  };
});

/** Exercise the publisher's manifests in isolation: no source files or optional adapter peers. */
export const verifyPackageConsumers = Effect.fn("verifyPackageConsumers")(function* (
  repositoryRoot: string,
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;

  // TypeScript resolves package symlinks to real paths, including macOS /var aliases.
  const stage = yield* fs
    .makeTempDirectoryScoped({ prefix: "effect-auth-consumers-" })
    .pipe(Effect.flatMap((directory) => fs.realPath(directory)));

  const source = path.join(repositoryRoot, "packages/auth");
  const destination = path.join(stage, "packages/auth");

  const manifest = yield* Schema.decodeUnknownEffect(Schema.fromJsonString(PublishManifest))(
    yield* fs.readFileString(path.join(source, "package.json")),
  );

  yield* fs.makeDirectory(destination, { recursive: true });
  yield* fs.copyFile(path.join(repositoryRoot, "package.json"), path.join(stage, "package.json"));
  yield* fs.copyFile(path.join(source, "package.json"), path.join(destination, "package.json"));
  yield* fs.copy(path.join(source, "dist"), path.join(destination, "dist"));
  yield* fs.copy(path.join(source, "test/packaging"), path.join(stage, "fixtures"));

  const exports = manifest.exports;

  if (exports === undefined)
    return yield* new PackageConsumerError({ message: "Core exports are missing" });

  // Load every published core module with Effect as its only installed dependency.
  for (const [name, target] of [
    ["@yielded/auth", destination],
    ["effect", yield* fs.realPath(path.join(source, "node_modules/effect"))],
  ] as const) {
    const link = path.join(stage, "node_modules", name);

    yield* fs.makeDirectory(path.dirname(link), { recursive: true });
    yield* fs.symlink(target, link);
  }
  yield* withPublishManifests(stage, () =>
    Effect.gen(function* () {
      const coreExports = Object.keys(exports).map((key) =>
        key === "." ? "@yielded/auth" : `@yielded/auth${key.slice(1)}`,
      );

      const declarations = path.join(stage, "fixtures/core-exports.ts");

      yield* fs.writeFileString(
        declarations,
        coreExports.map((name, index) => `export * as Core${index} from "${name}";`).join("\n"),
      );
      yield* checkDeclarations(stage, [declarations]);

      const child = yield* ChildProcess.make(
        "node",
        [
          "--input-type=module",
          "--eval",
          `for (const name of ${JSON.stringify(coreExports)}) await import(name);`,
        ],
        { cwd: stage, stdout: "pipe", stderr: "pipe" },
      );

      const [stderr, code] = yield* Effect.all(
        [Stream.mkString(Stream.decodeText(child.stderr)), child.exitCode],
        { concurrency: 2 },
      );

      if (code !== 0)
        return yield* new PackageConsumerError({
          message: `Effect-only core consumer exited ${code}: ${stderr}`,
        });
      yield* Console.log(
        `All ${coreExports.length} published core exports load and type-check with only Effect installed.`,
      );
    }),
  );

  const cryptoSource = path.join(repositoryRoot, "packages/auth-crypto");
  const cryptoDestination = path.join(stage, "packages/auth-crypto");

  const cryptoManifest = yield* Schema.decodeUnknownEffect(Schema.fromJsonString(PublishManifest))(
    yield* fs.readFileString(path.join(cryptoSource, "package.json")),
  );

  yield* fs.makeDirectory(cryptoDestination, { recursive: true });
  yield* fs.copyFile(
    path.join(cryptoSource, "package.json"),
    path.join(cryptoDestination, "package.json"),
  );
  yield* fs.copy(path.join(cryptoSource, "dist"), path.join(cryptoDestination, "dist"));

  const persistenceSource = path.join(repositoryRoot, "packages/auth-persistence");
  const persistenceDestination = path.join(stage, "packages/auth-persistence");

  const persistenceManifest = yield* Schema.decodeUnknownEffect(
    Schema.fromJsonString(PublishManifest),
  )(yield* fs.readFileString(path.join(persistenceSource, "package.json")));

  yield* fs.makeDirectory(persistenceDestination, { recursive: true });
  yield* fs.copyFile(
    path.join(persistenceSource, "package.json"),
    path.join(persistenceDestination, "package.json"),
  );
  yield* fs.copy(path.join(persistenceSource, "dist"), path.join(persistenceDestination, "dist"));
  yield* fs.copyFile(
    path.join(persistenceSource, "test/packaging/raw.ts"),
    path.join(stage, "fixtures/persistence.ts"),
  );

  // Only required dependencies are installed. An accidental optional import must fail.
  for (const name of new Set([
    "@yielded/auth",
    "@yielded/auth-persistence",
    "@yielded/auth-crypto",
    "effect",
    ...Object.keys(manifest.dependencies ?? {}),
    ...Object.keys(persistenceManifest.dependencies ?? {}),
    ...Object.keys(cryptoManifest.dependencies ?? {}),
  ])) {
    const link = path.join(stage, "node_modules", name);

    if (yield* fs.exists(link)) continue;
    yield* fs.makeDirectory(path.dirname(link), { recursive: true });
    yield* fs.symlink(
      name === "@yielded/auth"
        ? destination
        : name === "@yielded/auth-persistence"
          ? persistenceDestination
          : name === "@yielded/auth-crypto"
            ? cryptoDestination
            : yield* fs.realPath(path.join(cryptoSource, "node_modules", name)),
      link,
    );
  }

  yield* withPublishManifests(stage, () =>
    Effect.gen(function* () {
      for (const bundler of bundlers) {
        const results = yield* Effect.forEach(
          probes,
          (probe) => bundleConsumer(stage, probe, bundler),
          { concurrency: 2 },
        );

        for (const [name, namespace] of comparisons) {
          const direct = results.find((result) => result.probe === name);
          const root = results.find((result) => result.probe === namespace);

          if (direct === undefined || root === undefined)
            return yield* new PackageConsumerError({
              message: `Missing ${bundler}/${namespace} comparison`,
            });
          const extra = root.modules.filter((module) => !direct.modules.includes(module));

          if (bundler === "vite" && name !== "lazy" && extra.length > 0)
            return yield* new PackageConsumerError({
              message: `Vite ${namespace} import retained extra modules: ${extra.join(", ")}`,
            });
          yield* Console.log(
            `${bundler} ${name} vs ${namespace}: direct ${direct.initialBytes} + ${direct.deferredBytes} deferred; namespace ${root.initialBytes} + ${root.deferredBytes} deferred minified bytes (including Effect). Extra namespace modules: ${extra.length}.`,
          );
        }
      }

      const persistenceExports = Object.keys(persistenceManifest.exports ?? {}).map((key) =>
        key === "." ? "@yielded/auth-persistence" : `@yielded/auth-persistence${key.slice(1)}`,
      );

      const persistenceDeclarations = path.join(stage, "fixtures/persistence-exports.ts");

      yield* fs.writeFileString(
        persistenceDeclarations,
        persistenceExports
          .map((name, index) => `export * as Persistence${index} from "${name}";`)
          .join("\n"),
      );
      yield* checkDeclarations(stage, [
        persistenceDeclarations,
        ...probes.map((probe) => path.join(stage, "fixtures", `${probe}.ts`)),
      ]);

      // Native ESM must load without optional peers and expose exactly the direct module.
      // Execute separately so the repository's installed peers cannot mask missing imports.
      const child = yield* ChildProcess.make(
        "node",
        [
          "--input-type=module",
          "--eval",
          `import assert from "node:assert/strict";
const root = await import("@yielded/auth");
for (const name of ${JSON.stringify(persistenceExports)}) await import(name);
const { AuthPersistence } = await import("@yielded/auth-persistence");
assert.equal(typeof AuthPersistence.make, "function");
assert.equal(typeof AuthPersistence.table, "function");
for (const [name, namespace] of Object.entries(root)) {
  const direct = await import("@yielded/auth/" + name);
  assert.strictEqual(namespace, direct, name + " must be a native module namespace");
}
const contracts = await import("@yielded/auth/contracts");
const strategies = await import("@yielded/auth/strategies");
for (const group of [contracts, strategies]) {
  for (const [name, namespace] of Object.entries(group)) {
    const direct = await import("@yielded/auth/" + name);
    assert.strictEqual(namespace, direct, name + " group must preserve the direct namespace");
  }
}
const names = [...Object.keys(contracts), ...Object.keys(strategies)];
assert.equal(new Set(names).size, names.length, "Contract and strategy names must not collide");
assert.equal(contracts.PasskeyContract.make, root.PasskeyContract.make);
assert.equal(strategies.Passkey.make, root.Passkey.make);
const { Effect } = await import("effect");
assert.equal(await Effect.runPromise(root.Identity.stringSubjectId.toSubject("consumer")), "consumer");
for (const bundler of ["esbuild", "vite"]) {
  const persistence = await import("./bundles/" + bundler + "/persistence/entry.mjs");
  assert.ok(persistence.storage.schema.passwords);
  assert.equal(persistence.storage.schema.proofRequests, undefined);
  const passkey = await import("./bundles/" + bundler + "/passkey-group/entry.mjs");
  const { Schema } = await import("effect");
  const sessions = contracts.SessionContract.makeSessionContract("consumer/session", Schema.Struct({}));
  assert.equal(passkey.contract("consumer/passkey", sessions).operations.Begin.exposure, "public");
  assert.equal(typeof passkey.strategy({ relyingParty: { id: "example.com", name: "Example", origins: ["https://example.com"] } }).bind, "function");
  for (const suffix of ["", "-root"]) {
    const bundled = await import("./bundles/" + bundler + "/identity" + suffix + "/entry.mjs");
    assert.equal(await Effect.runPromise(bundled.stringSubjectId.toSubject("bundled-consumer")), "bundled-consumer");
    const lazy = await import("./bundles/" + bundler + "/lazy" + suffix + "/entry.mjs");
    assert.equal(typeof (await Effect.runPromise(lazy.client)).make, "function");
  }
}
assert.equal(typeof root.Http.layer, "function");
assert.equal(typeof root.PasskeyContract.make, "function");
assert.equal(typeof root.PasskeyContract.makeRegistration, "function");
assert.equal(typeof root.PasskeyContract.makeManagement, "function");
assert.equal(typeof root.TotpContract.make, "function");
assert.ok(root.SessionContract.makeSessionContract);
console.log("Published namespaces, codecs, deferred clients, and raw SQL persistence passed without optional peers.");`,
        ],
        { cwd: stage, stdout: "pipe", stderr: "pipe" },
      );

      const [stdout, stderr, code] = yield* Effect.all(
        [
          Stream.mkString(Stream.decodeText(child.stdout)),
          Stream.mkString(Stream.decodeText(child.stderr)),
          child.exitCode,
        ],
        { concurrency: 3 },
      );

      if (code !== 0)
        return yield* new PackageConsumerError({
          message: `Published runtime consumer exited ${code}: ${stdout}${stderr}`,
        });
      yield* Console.log(stdout.trim());
    }),
  );
}, Effect.scoped);

const program = Effect.gen(function* () {
  const path = yield* Path.Path;
  const script = yield* path.fromFileUrl(new URL(import.meta.url));

  yield* verifyPackageConsumers(path.resolve(path.dirname(script), ".."));
}).pipe(
  Effect.tapError((error) => Console.error(error.message)),
  Effect.provide(NodeServices.layer),
);

if (import.meta.main) NodeRuntime.runMain(program, { disableErrorReporting: true });
