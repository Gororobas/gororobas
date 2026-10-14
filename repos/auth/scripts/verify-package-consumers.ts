import { createHash } from "node:crypto";

import { NodeRuntime, NodeServices } from "@effect/platform-node";
import { Console, Effect, FileSystem, Path, Schema, Stream } from "effect";
import { ChildProcess } from "effect/process";
import { build } from "esbuild";
import ts from "typescript-twoslash";
import { build as viteBuild } from "vite-plus";

import authCryptoFixtures from "../packages/auth/test/crypto-fixtures.ts";
import { aeadVectors, argon2Vector } from "../packages/crypto/test/vectors.ts";
import { PublishManifest, withPublishManifests } from "./release-publish.ts";
import { ReusableManifest, reusableDependencyProblems } from "./verify-package-exports.ts";

class PackageConsumerError extends Schema.TaggedError<PackageConsumerError>()(
  "PackageConsumerError",
  { message: Schema.String, cause: Schema.optionalKey(Schema.Defect()) },
) {}

const SourceMap = Schema.Struct({
  sources: Schema.Array(Schema.String),
  sourceRoot: Schema.optionalKey(Schema.String),
});

/** Owned, attributed source is allowed; bundling from installed packages is not. */
const checkReusableBuild = Effect.fn("packageConsumers.reusableBuild")(function* (
  directory: string,
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const pending = [path.join(directory, "dist")];

  while (pending.length > 0) {
    const current = pending.pop();

    if (current === undefined) break;

    for (const name of yield* fs.readDirectory(current)) {
      const file = path.join(current, name);

      if ((yield* fs.stat(file)).type === "Directory") {
        if (name === "node_modules")
          return yield* PackageConsumerError.make({
            message: `${file} must not ship installed dependencies`,
          });
        pending.push(file);
        continue;
      }
      if (!/\.[cm]?js$/.test(name)) continue;
      if (!(yield* fs.exists(`${file}.map`))) {
        const code = yield* fs.readFileString(file);

        // The pinned compiler emits this namespace helper without a map. Match
        // its exact bytes, so any compiler change or extra bundled code is reviewed.
        if (
          path.relative(directory, file).replaceAll("\\", "/") ===
            "dist/_virtual/_rolldown/runtime.mjs" &&
          createHash("sha256").update(code).digest("hex") ===
            "1b10431e13b4eb349c329aba7d2beb6e6c224de569eac52966731c8239a941c9"
        )
          continue;

        // Rolldown omits maps for generated import/export-only facades. Their
        // local targets are inspected separately; executable code needs a map.
        const source = ts.createSourceFile(
          file,
          code,
          ts.ScriptTarget.Latest,
          true,
          ts.ScriptKind.JS,
        );

        const facade = source.statements.every((statement) => {
          if (!ts.isImportDeclaration(statement) && !ts.isExportDeclaration(statement))
            return false;
          if (statement.moduleSpecifier === undefined) return ts.isExportDeclaration(statement);
          if (!ts.isStringLiteral(statement.moduleSpecifier)) return false;
          const specifier = statement.moduleSpecifier.text;
          const target = path.resolve(current, specifier);

          return (
            specifier.startsWith(".") && target.startsWith(`${directory}${path.sep}dist${path.sep}`)
          );
        });

        if (!facade)
          return yield* PackageConsumerError.make({
            message: `${file} needs a source map to audit build-time dependency bundling`,
          });
        continue;
      }

      const map = yield* Schema.decodeEffect(Schema.fromJsonString(SourceMap))(
        yield* fs.readFileString(`${file}.map`),
      );

      for (const source of map.sources) {
        const resolved = path.resolve(current, map.sourceRoot ?? "", source);
        const relative = path.relative(path.join(directory, "src"), resolved);

        if (
          relative.startsWith("../") ||
          path.isAbsolute(relative) ||
          relative.split(path.sep).includes("node_modules")
        )
          return yield* PackageConsumerError.make({
            message: `${file} bundles source outside its owned src directory: ${source}`,
          });
      }
    }
  }
});

const checkReusableOperations = Effect.fn("packageConsumers.reusableOperations")(function* (
  stage: string,
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;

  // Reuse independent RFC9106 and XChaCha draft vectors, including their provenance.
  // JOSE's native oracle matches test/compact-validation.test.ts; no jose is installed.
  yield* fs.writeFileString(
    path.join(stage, "fixtures/reusable-operations.mjs"),
    `import assert from "node:assert/strict";
import { createCipheriv, createHmac } from "node:crypto";
import { Crypto, Effect, Layer, Redacted, Schema } from "effect";
import { FetchHttpClient } from "effect/http";
import { OAuth, Pkce } from "@yielded/oauth";
import { Aead, Kdf, KdfAdmission } from "@yielded/crypto";
import * as Portable from "@yielded/crypto/Portable";
import { Jwe, Jwk, Jws, Jwt } from "@yielded/jose";
const Platform = await import(process.argv[2]);
const argon = ${JSON.stringify(argon2Vector)};
const vector = ${JSON.stringify(aeadVectors[1])};
const bytes = (hex) => new Uint8Array(Buffer.from(hex, "hex"));
const hex = (value) => Buffer.from(value).toString("hex");
const utf8 = (value) => new TextEncoder().encode(value);
const text = (value) => new TextDecoder().decode(value);
for (const backend of [Portable.layer(globalThis.crypto.subtle), Platform.layer()]) {
  await Effect.runPromise(Effect.gen(function* () {
    const kdf = yield* Kdf.Kdf;
    const derived = yield* kdf.argon2id({
      password: Redacted.make(bytes(argon.passwordHex)), salt: bytes(argon.saltHex),
      secret: Redacted.make(bytes(argon.secretHex)), associatedData: bytes(argon.associatedDataHex),
      memoryKiB: argon.memoryKiB, passes: argon.iterations,
      parallelism: argon.parallelism, length: argon.lengthBytes,
    });
    assert.equal(hex(Redacted.value(derived)), argon.expectedHex);
    const aead = yield* Aead.Aead;
    const context = {
      algorithm: vector.algorithm, key: Redacted.make(bytes(vector.keyHex)),
      nonce: bytes(vector.nonceHex), additionalData: bytes(vector.aadHex),
    };
    const sealed = yield* aead.encrypt({ ...context, plaintext: Redacted.make(bytes(vector.plaintextHex)) });
    assert.equal(hex(sealed), vector.sealedHex);
    const opened = yield* aead.decrypt({ ...context, ciphertext: bytes(vector.sealedHex) });
    assert.equal(hex(Redacted.value(opened)), vector.plaintextHex);
    sealed[0] ^= 1;
    const rejected = yield* aead.decrypt({ ...context, ciphertext: sealed }).pipe(Effect.flip);
    assert.equal(rejected._tag, "CryptoAuthenticationFailed");

    const secret = new Uint8Array(32).fill(7);
    const jwk = { kty: "oct", k: Buffer.from(secret).toString("base64url") };
    const signing = yield* Jwk.importSecret(Redacted.make(jwk), "HS256");
    const payload = utf8(JSON.stringify({ sub: "packaged-consumer" }));
    const input = Buffer.from(JSON.stringify({ alg: "HS256" })).toString("base64url") + "." + Buffer.from(payload).toString("base64url");
    const expected = input + "." + createHmac("sha256", secret).update(input).digest("base64url");
    const signed = yield* Jws.sign(Redacted.make(payload), signing, { alg: "HS256" });
    assert.equal(Redacted.value(signed), expected);
    const verified = yield* Jwt.verify(Schema.Struct({ sub: Schema.String }), Redacted.make(expected), signing, { algorithms: ["HS256"] });
    assert.equal(verified.claims.sub, "packaged-consumer");

    const encryption = yield* Jwk.importSecret(Redacted.make(jwk), "dir");
    const header = Buffer.from(JSON.stringify({ alg: "dir", enc: "A256GCM" })).toString("base64url");
    const iv = new Uint8Array(12);
    const cipher = createCipheriv("aes-256-gcm", secret, iv);
    cipher.setAAD(utf8(header));
    const ciphertext = Buffer.concat([cipher.update(utf8("payload")), cipher.final()]);
    const token = [header, "", Buffer.from(iv).toString("base64url"), ciphertext.toString("base64url"), cipher.getAuthTag().toString("base64url")].join(".");
    const decrypted = yield* Jwe.decrypt(Redacted.make(token), encryption);
    assert.equal(text(Redacted.value(decrypted.plaintext)), "payload");
  }).pipe(Effect.provide(backend.pipe(Layer.provide(KdfAdmission.layer())))));
}
const effectCrypto = Layer.succeed(Crypto.Crypto, Crypto.make({
  randomBytes: size => crypto.getRandomValues(new Uint8Array(size)),
  digest: (algorithm, data) => Effect.promise(() => crypto.subtle.digest(algorithm, data)).pipe(Effect.map(buffer => new Uint8Array(buffer))),
}));
let requests = 0;
const fetchReceipt = async (url, init) => {
  requests++;
  assert.equal(String(url), "https://issuer.example/token");
  assert.equal(init.redirect, "manual");
  assert.equal(init.credentials, "omit");
  const form = new URLSearchParams(text(init.body));
  assert.equal(form.get("grant_type"), "authorization_code");
  assert.equal(form.get("code_verifier"), "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk");
  return Response.json({ access_token: "private-access", token_type: "bearer", expires_in: 60 });
};
await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
  const verifier = Redacted.make("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk");
  assert.equal(yield* Pkce.challenge(verifier), "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
  const client = yield* OAuth.make({
    metadata: { issuer: "https://issuer.example", authorization_endpoint: "https://issuer.example/authorize", token_endpoint: "https://issuer.example/token" },
    clientId: "client", authentication: { method: "client_secret_basic", secret: Redacted.make("secret") }, timeoutMs: 1000,
  });
  const receipt = yield* client.codeGrant({ code: Redacted.make("single-use-code"), redirectUri: "https://app.example/callback", pkceVerifier: verifier });
  const tokens = yield* OAuth.tokens(receipt);
  assert.equal(Redacted.value(tokens.accessToken), "private-access");
  assert.equal(requests, 1);
})).pipe(Effect.provide(Layer.merge(effectCrypto, FetchHttpClient.layer)), Effect.provideService(FetchHttpClient.Fetch, fetchReceipt)));
console.log("Packaged portable/native Argon2id, XChaCha, JWS/JWT, JWE and native OAuth passed with only Effect and first-party packages.");`,
  );
  for (const runtime of ["node", "bun"] as const) {
    const child = yield* ChildProcess.make(
      runtime,
      [
        ...(runtime === "bun" ? ["--no-install"] : []),
        "fixtures/reusable-operations.mjs",
        `@yielded/crypto/platform-${runtime}`,
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
      return yield* PackageConsumerError.make({
        message: `${runtime} packaged operations exited ${code}: ${stdout}${stderr}`,
      });
    yield* Console.log(`${runtime}: ${stdout.trim()}`);
  }
});

const checkAuthOperations = Effect.fn("packageConsumers.authOperations")(function* (stage: string) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;

  yield* fs.writeFileString(
    path.join(stage, "fixtures/auth-operations.mjs"),
    `import assert from "node:assert/strict";
import { Effect, Layer, Redacted, Schema } from "effect";
import { Password, Totp, OAuth } from "@yielded/auth";
import { layerCryptoWeb } from "@yielded/auth/WebCrypto";
import * as Portable from "@yielded/crypto/Portable";
import * as KdfAdmission from "@yielded/crypto/KdfAdmission";
const fixtures = ${JSON.stringify(authCryptoFixtures)};
const admission = KdfAdmission.layer({ maxQueued: 0 });
const runtime = Layer.merge(layerCryptoWeb, Portable.layer(globalThis.crypto.subtle).pipe(Layer.provideMerge(admission)));
const key = Redacted.make(Schema.decodeUnknownSync(Schema.Uint8ArrayFromBase64Url)(fixtures.totp.key));
const keys = Layer.succeed(Totp.TotpSecretKeys, { current: Effect.succeed({ keyId: "key1", key }), get: () => Effect.succeed(key) });
const keyring = { activeKeyId: "key1", keys: [{ id: "key1", material: Redacted.make(fixtures.oauth.key) }] };
const services = Layer.mergeAll(
  Password.PasswordHashing.layer(),
  Totp.TotpCryptography.layer.pipe(Layer.provide(keys)),
  OAuth.OAuthTransactionProtector.layer(keyring),
  OAuth.OAuthLinkTransactionProtector.layer(keyring),
  OAuth.OAuthConnectedTransactionProtector.layer(keyring),
  OAuth.OAuthConnectedTokenProtector.layer(keyring),
).pipe(Layer.provide(runtime));
await Effect.runPromise(Effect.gen(function* () {
  const hashing = yield* Password.PasswordHashing;
  for (const encoded of [fixtures.password.phc, fixtures.password.pbkdf2]) {
    const verified = yield* hashing.verify(Redacted.make(fixtures.password.password), Redacted.make(Password.EncodedPasswordHash.make(encoded)));
    assert.equal(verified.matches, true);
  }
  const totp = yield* Totp.TotpCryptography;
  const secret = yield* totp.decryptSecret(Schema.decodeUnknownSync(Totp.TotpSecretBinding)(fixtures.totp.binding), Schema.decodeUnknownSync(Totp.TotpSecretEnvelope)(fixtures.totp.envelope));
  assert.equal(Buffer.from(secret).toString("base64url"), fixtures.totp.secret);
  assert.equal(yield* totp.matchCode(secret, "287082", 59000, 0), 1);
  assert.equal(yield* totp.recoveryDigest("totp", "subject", fixtures.totp.recovery), fixtures.totp.digest);
  for (const [service, contextSchema, sealedSchema, plainSchema, fixture] of [
    [OAuth.OAuthTransactionProtector, OAuth.OAuthSignInTransactionContext, OAuth.OAuthSealedTransaction, OAuth.OAuthTransactionSecrets, fixtures.oauth.signIn],
    [OAuth.OAuthLinkTransactionProtector, OAuth.OAuthLinkTransactionContext, OAuth.OAuthSealedTransaction, OAuth.OAuthTransactionSecrets, fixtures.oauth.link],
    [OAuth.OAuthConnectedTransactionProtector, OAuth.OAuthConnectedTransactionContext, OAuth.OAuthSealedTransaction, OAuth.OAuthTransactionSecrets, fixtures.oauth.connected],
    [OAuth.OAuthConnectedTokenProtector, OAuth.OAuthConnectedTokenContext, OAuth.OAuthConnectedSealedTokens, OAuth.OAuthConnectedTokenMaterial, fixtures.oauth.token],
  ]) {
    const protector = yield* service;
    const plain = yield* protector.open({context: Schema.decodeUnknownSync(contextSchema)(fixture.context), sealed: Schema.decodeUnknownSync(sealedSchema)(fixture.sealed)});
    assert.deepEqual(Schema.encodeSync(plainSchema)(plain), fixture.plain);
  }
}).pipe(Effect.provide(services)));
console.log("Published Auth verifies stored passwords, TOTP/recovery and all four OAuth envelopes without third-party runtime packages.");`,
  );
  for (const runtime of ["node", "bun"] as const) {
    const child = yield* ChildProcess.make(
      runtime,
      [...(runtime === "bun" ? ["--no-install"] : []), "fixtures/auth-operations.mjs"],
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
      return yield* PackageConsumerError.make({
        message: `${runtime} published Auth operations exited ${code}: ${stdout}${stderr}`,
      });
    yield* Console.log(`${runtime}: ${stdout.trim()}`);
  }
});

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
    return yield* PackageConsumerError.make({
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
      PackageConsumerError.make({ message: `Cannot bundle esbuild consumer ${probe}`, cause }),
  });

  const chunks: Array<Chunk> = [];

  for (const file of result.outputFiles) {
    const output = result.metafile.outputs[path.relative(stage, file.path)];

    if (output === undefined || output.imports.some((item) => item.external))
      return yield* PackageConsumerError.make({
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
      PackageConsumerError.make({ message: `Cannot bundle Vite consumer ${probe}`, cause }),
  });

  const chunks: Array<Chunk> = [];

  for (const bundle of Array.isArray(result) ? result : [result]) {
    if (!("output" in bundle))
      return yield* PackageConsumerError.make({
        message: `Vite consumer ${probe} unexpectedly started a watcher`,
      });
    for (const file of bundle.output) {
      if (file.type !== "chunk") continue;
      if (
        [...file.imports, ...file.dynamicImports].some(
          (name) => !bundle.output.some((output) => output.fileName === name),
        )
      )
        return yield* PackageConsumerError.make({
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
    return yield* PackageConsumerError.make({ message: `${bundler}/${probe} must emit one entry` });
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
      return yield* PackageConsumerError.make({
        message: `${bundler}/${probe} lost its deferred client boundary`,
      });
  }
  if (unwanted.length > 0)
    return yield* PackageConsumerError.make({
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

const stagePackage = Effect.fn("packageConsumers.stagePackage")(function* (
  repositoryRoot: string,
  stage: string,
  directory: string,
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const source = path.join(repositoryRoot, "packages", directory);
  const destination = path.join(stage, "packages", directory);

  const manifest = yield* Schema.decodeEffect(Schema.fromJsonString(PublishManifest))(
    yield* fs.readFileString(path.join(source, "package.json")),
  );

  yield* fs.makeDirectory(destination, { recursive: true });
  yield* fs.copyFile(path.join(source, "package.json"), path.join(destination, "package.json"));
  yield* fs.copy(path.join(source, "dist"), path.join(destination, "dist"));
  const link = path.join(stage, "node_modules", manifest.name);

  yield* fs.makeDirectory(path.dirname(link), { recursive: true });
  yield* fs.symlink(destination, link);

  return { source, destination, manifest };
});

const checkReusableConsumers = Effect.fn("packageConsumers.reusable")(function* (
  repositoryRoot: string,
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;

  const stage = yield* fs
    .makeTempDirectoryScoped({ prefix: "yielded-crypto-consumers-" })
    .pipe(Effect.flatMap((directory) => fs.realPath(directory)));

  yield* fs.makeDirectory(path.join(stage, "fixtures"), { recursive: true });
  yield* fs.copyFile(path.join(repositoryRoot, "package.json"), path.join(stage, "package.json"));
  const { source, destination, manifest } = yield* stagePackage(repositoryRoot, stage, "crypto");
  const jose = yield* stagePackage(repositoryRoot, stage, "jose");
  const oauth = yield* stagePackage(repositoryRoot, stage, "oauth");

  if (
    manifest.exports === undefined ||
    jose.manifest.exports === undefined ||
    oauth.manifest.exports === undefined
  )
    return yield* PackageConsumerError.make({
      message: "Crypto, JOSE and OAuth exports are required",
    });
  const joseEntries = Object.keys(jose.manifest.exports);
  const oauthEntries = Object.keys(oauth.manifest.exports);
  const effectSource = yield* fs.realPath(path.join(source, "node_modules/effect"));

  yield* fs.symlink(effectSource, path.join(stage, "node_modules/effect"));

  const namespaces = ["Aead", "Errors", "Hmac", "Kdf", "KdfAdmission", "Signature"];
  const joseNamespaces = ["Errors", "Jwe", "Jwk", "Jwks", "Jws", "Jwt"];
  const oauthNamespaces = ["Errors", "OAuth", "Oidc", "Pkce"];
  const contracts = [".", ...namespaces.map((name) => `./${name}`)];
  const backends = Object.keys(manifest.exports).filter((key) => !contracts.includes(key));

  // Only first-party crypto, JOSE, OAuth and Effect exist throughout this stage.
  yield* withPublishManifests(stage, () =>
    Effect.gen(function* () {
      for (const directory of [destination, jose.destination, oauth.destination]) {
        const published = yield* Schema.decodeEffect(Schema.fromJsonString(ReusableManifest))(
          yield* fs.readFileString(path.join(directory, "package.json")),
        );

        const problems = reusableDependencyProblems(published, {});

        if (problems.length > 0)
          return yield* PackageConsumerError.make({ message: problems.join("\n") });
        yield* checkReusableBuild(directory);
      }
      for (const [probe, entries, packageName, rootNamespaces] of [
        ["crypto-contracts", contracts, "@yielded/crypto", namespaces],
        ["jose", joseEntries, "@yielded/jose", joseNamespaces],
        ["oauth", oauthEntries, "@yielded/oauth", oauthNamespaces],
        ["crypto-backends", backends, "@yielded/crypto", namespaces],
      ] as const) {
        const names = entries.map((key) =>
          key === "." ? packageName : `${packageName}${key.slice(1)}`,
        );

        const declarations = path.join(stage, "fixtures", `${probe}.ts`);

        yield* fs.writeFileString(
          declarations,
          names.map((name, index) => `export * as Crypto${index} from "${name}";`).join("\n"),
        );
        yield* checkDeclarations(stage, [declarations]);

        // Only the direct runtime entries may pull native imports into a consumer.
        yield* fs.writeFileString(
          path.join(stage, "fixtures", `${probe}-browser.ts`),
          names
            .filter((name) => !name.startsWith("@yielded/crypto/platform-"))
            .map((name, index) => `export * as Crypto${index} from "${name}";`)
            .join("\n"),
        );
        const chunks = yield* esbuildConsumer(stage, `${probe}-browser`);

        const allowedDirectories = [
          path.join(stage, "fixtures"),
          path.join(destination, "dist"),
          path.join(jose.destination, "dist"),
          path.join(oauth.destination, "dist"),
          effectSource,
        ];

        for (const module of chunks.flatMap((chunk) => chunk.modules)) {
          const resolved = path.resolve(stage, module);

          if (
            !allowedDirectories.some((directory) => resolved.startsWith(`${directory}${path.sep}`))
          )
            return yield* PackageConsumerError.make({
              message: `${probe} bundles a module outside Effect and the staged packages: ${module}`,
            });
        }

        const child = yield* ChildProcess.make(
          "node",
          [
            "--input-type=module",
            "--eval",
            `import assert from "node:assert/strict";
const root = await import(${JSON.stringify(packageName)});
assert.deepEqual(Object.keys(root).sort(), ${JSON.stringify(rootNamespaces)});
for (const name of ${JSON.stringify(rootNamespaces)}) {
  assert.equal(root[name], await import(${JSON.stringify(packageName + "/")} + name));
}
for (const name of ${JSON.stringify(names.filter((name) => name !== "@yielded/crypto/platform-workerd"))}) await import(name);`,
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
          return yield* PackageConsumerError.make({
            message: `${probe} consumer exited ${code}: ${stdout}${stderr}`,
          });
        yield* Console.log(
          `${probe}: ${names.length} published exports type-check with only Effect and first-party packages; Node loading excludes workerd and browser imports exclude platform entries.`,
        );
      }
      yield* checkReusableOperations(stage);
    }),
  );
});

/** Exercise the publisher's manifests in isolation: no source files or optional adapter peers. */
export const verifyPackageConsumers = Effect.fn("verifyPackageConsumers")(function* (
  repositoryRoot: string,
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;

  yield* checkReusableConsumers(repositoryRoot);

  // TypeScript resolves package symlinks to real paths, including macOS /var aliases.
  const stage = yield* fs
    .makeTempDirectoryScoped({ prefix: "effect-auth-consumers-" })
    .pipe(Effect.flatMap((directory) => fs.realPath(directory)));

  const source = path.join(repositoryRoot, "packages/auth");
  const destination = path.join(stage, "packages/auth");

  const manifest = yield* Schema.decodeEffect(Schema.fromJsonString(PublishManifest))(
    yield* fs.readFileString(path.join(source, "package.json")),
  );

  yield* fs.makeDirectory(destination, { recursive: true });
  yield* fs.copyFile(path.join(repositoryRoot, "package.json"), path.join(stage, "package.json"));
  yield* fs.copyFile(path.join(source, "package.json"), path.join(destination, "package.json"));
  yield* fs.copy(path.join(source, "dist"), path.join(destination, "dist"));
  yield* fs.copy(path.join(source, "test/packaging"), path.join(stage, "fixtures"));

  const exports = manifest.exports;

  if (exports === undefined)
    return yield* PackageConsumerError.make({ message: "Core exports are missing" });

  // Load every core module with its complete first-party runtime graph and Effect.
  for (const directory of ["crypto", "jose", "oauth"])
    yield* stagePackage(repositoryRoot, stage, directory);
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
      const published = yield* Schema.decodeEffect(Schema.fromJsonString(ReusableManifest))(
        yield* fs.readFileString(path.join(destination, "package.json")),
      );

      const problems = reusableDependencyProblems(published, {});

      if (problems.length > 0)
        return yield* PackageConsumerError.make({ message: problems.join("\n") });
      yield* checkReusableBuild(destination);

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
          `for (const name of ${JSON.stringify(coreExports.filter((name) => name !== "@yielded/auth/WorkerdServices"))}) await import(name);`,
        ],
        { cwd: stage, stdout: "pipe", stderr: "pipe" },
      );

      const [stderr, code] = yield* Effect.all(
        [Stream.mkString(Stream.decodeText(child.stderr)), child.exitCode],
        { concurrency: 2 },
      );

      if (code !== 0)
        return yield* PackageConsumerError.make({
          message: `Core consumer with only Effect and first-party packages exited ${code}: ${stderr}`,
        });
      yield* Console.log(
        `All ${coreExports.length} published core exports type-check with only Effect and first-party packages installed; Node loading excludes WorkerdServices.`,
      );
      yield* checkAuthOperations(stage);
    }),
  );

  const persistenceSource = path.join(repositoryRoot, "packages/auth-persistence");
  const persistenceDestination = path.join(stage, "packages/auth-persistence");

  const persistenceManifest = yield* Schema.decodeEffect(Schema.fromJsonString(PublishManifest))(
    yield* fs.readFileString(path.join(persistenceSource, "package.json")),
  );

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

  // Required first-party packages and Effect only; optional adapter peers remain absent.
  yield* fs.symlink(
    persistenceDestination,
    path.join(stage, "node_modules/@yielded/auth-persistence"),
  );

  yield* withPublishManifests(stage, () =>
    Effect.gen(function* () {
      const published = yield* Schema.decodeEffect(Schema.fromJsonString(ReusableManifest))(
        yield* fs.readFileString(path.join(persistenceDestination, "package.json")),
      );

      const problems = reusableDependencyProblems(published, {});

      if (problems.length > 0)
        return yield* PackageConsumerError.make({ message: problems.join("\n") });
      yield* checkReusableBuild(persistenceDestination);
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
            return yield* PackageConsumerError.make({
              message: `Missing ${bundler}/${namespace} comparison`,
            });
          const extra = root.modules.filter((module) => !direct.modules.includes(module));

          if (bundler === "vite" && name !== "lazy" && extra.length > 0)
            return yield* PackageConsumerError.make({
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
  assert.equal(persistence.storage.schema.proofs, undefined);
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
        return yield* PackageConsumerError.make({
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
