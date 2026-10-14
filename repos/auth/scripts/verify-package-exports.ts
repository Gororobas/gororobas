import { isBuiltin } from "node:module";

import { NodeRuntime, NodeServices } from "@effect/platform-node";
import { Console, Effect, FileSystem, Path, Schema } from "effect";
import ts from "typescript-twoslash";

const coreDependencies = new Set(["effect"]);
const authPackage = /^@yielded\/auth(?:$|[-/])/;

const Dependencies = Schema.Record(Schema.String, Schema.String);
const BundledDependencies = Schema.Union([Schema.Boolean, Schema.Array(Schema.String)]);

export const ReusableManifest = Schema.Struct({
  name: Schema.String,
  dependencies: Schema.optionalKey(Dependencies),
  optionalDependencies: Schema.optionalKey(Dependencies),
  peerDependencies: Schema.optionalKey(Dependencies),
  bundledDependencies: Schema.optionalKey(BundledDependencies),
  bundleDependencies: Schema.optionalKey(BundledDependencies),
});

const reusableDependencies = (name: string): ReadonlySet<string> | undefined =>
  name === "@yielded/crypto"
    ? coreDependencies
    : name === "@yielded/jose"
      ? new Set(["effect", "@yielded/crypto"])
      : name === "@yielded/oauth"
        ? new Set(["effect", "@yielded/jose"])
        : name === "@yielded/auth"
          ? new Set(["effect", "@yielded/crypto", "@yielded/jose", "@yielded/oauth"])
          : name === "@yielded/auth-persistence"
            ? new Set(["effect", "@yielded/auth", "@yielded/crypto"])
            : undefined;

/** Check source and publisher-resolved manifests, including aliases and optional peers. */
export const reusableDependencyProblems = (
  manifest: typeof ReusableManifest.Type,
  catalog: Readonly<Record<string, string>>,
): Array<string> => {
  const allowed = reusableDependencies(manifest.name);
  const problems: Array<string> = [];

  if (allowed === undefined) return problems;
  for (const section of ["dependencies", "optionalDependencies", "peerDependencies"] as const) {
    for (const [name, range] of Object.entries(manifest[section] ?? {})) {
      const resolved = range === "catalog:" ? catalog[name] : range;

      const alias = resolved?.startsWith("npm:")
        ? /^npm:((?:@[^/]+\/)?[^@]+)(?:@.+)?$/.exec(resolved)?.[1]
        : name;

      const permittedRange =
        resolved !== undefined &&
        (resolved.startsWith("npm:")
          ? alias === name
          : resolved.startsWith("workspace:")
            ? name.startsWith("@yielded/") && allowed.has(name) && resolved === "workspace:*"
            : !resolved.includes(":") && !resolved.includes("/"));

      if (!allowed.has(name) || !permittedRange)
        problems.push(
          `${manifest.name} ${section}.${name} (${range}${resolved !== range ? ` -> ${resolved ?? "missing catalog entry"}` : ""}) is outside its runtime dependency graph`,
        );
    }
  }
  for (const section of ["bundledDependencies", "bundleDependencies"] as const) {
    const bundled = manifest[section];

    if (bundled === true || (Array.isArray(bundled) && bundled.length > 0))
      problems.push(`${manifest.name} must not bundle installed dependencies (${section})`);
  }

  return problems;
};

const Manifest = Schema.Struct({
  name: Schema.String,
  private: Schema.optionalKey(Schema.Boolean),
  exports: Dependencies,
  bin: Schema.optionalKey(Dependencies),
  dependencies: Schema.optionalKey(Dependencies),
  optionalDependencies: Schema.optionalKey(Dependencies),
  peerDependencies: Schema.optionalKey(Dependencies),
  devDependencies: Schema.optionalKey(Dependencies),
  bundledDependencies: Schema.optionalKey(BundledDependencies),
  bundleDependencies: Schema.optionalKey(BundledDependencies),
});

class PackageExportsError extends Schema.TaggedError<PackageExportsError>()("PackageExportsError", {
  message: Schema.String,
  cause: Schema.optionalKey(Schema.Defect()),
}) {}

const propertyName = (node: ts.PropertyName): string | undefined =>
  ts.isIdentifier(node) || ts.isStringLiteral(node) ? node.text : undefined;

const walk = (node: ts.Node, visit: (node: ts.Node) => void): void => {
  visit(node);
  ts.forEachChild(node, (child) => walk(child, visit));
};

/** Manifests own the public module list; config and source must agree without evaluating code. */
export const verifyPackageExports = Effect.fn("verifyPackageExports")(
  function* (root: string) {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const problems: Array<string> = [];
    const report = (file: string, message: string) => problems.push(`${file}: ${message}`);

    const read = Effect.fn("packageExports.read")(function* (file: string) {
      return yield* fs
        .readFileString(path.join(root, file))
        .pipe(
          Effect.mapError((cause) =>
            PackageExportsError.make({ message: `Cannot read ${file}`, cause }),
          ),
        );
    });

    const parse = Effect.fn("packageExports.parse")(function* (file: string) {
      return ts.createSourceFile(
        file,
        yield* read(file),
        ts.ScriptTarget.Latest,
        true,
        file.endsWith(".json")
          ? ts.ScriptKind.JSON
          : file.endsWith(".tsx")
            ? ts.ScriptKind.TSX
            : ts.ScriptKind.TS,
      );
    });

    const { catalog } = yield* Schema.decodeEffect(
      Schema.fromJsonString(Schema.Struct({ catalog: Dependencies })),
    )(yield* read("package.json"));

    const packages = yield* Effect.forEach(
      (yield* fs.readDirectory(path.join(root, "packages")))
        .filter((name) => !name.startsWith("."))
        .sort(),
      Effect.fn(function* (directory) {
        const file = `packages/${directory}/package.json`;
        const source = yield* read(file);

        const manifest = yield* Schema.decodeEffect(Schema.fromJsonString(Manifest))(source).pipe(
          Effect.mapError((cause) =>
            PackageExportsError.make({ message: `Invalid ${file}`, cause }),
          ),
        );

        // JSON decoding discards duplicate keys, so inspect the original JSON syntax as well.
        walk(
          ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JSON),
          (node) => {
            if (!ts.isObjectLiteralExpression(node)) return;
            const keys = new Set<string>();

            for (const property of node.properties) {
              if (!ts.isPropertyAssignment(property)) continue;
              const key = propertyName(property.name);

              if (key === undefined) continue;
              if (keys.has(key)) report(file, `Duplicate key ${key}`);
              keys.add(key);
            }
          },
        );

        return { directory, file, manifest };
      }),
    );

    for (const pkg of packages) {
      for (const problem of reusableDependencyProblems(pkg.manifest, catalog))
        report(pkg.file, problem);
      if (["@yielded/crypto", "@yielded/jose", "@yielded/oauth"].includes(pkg.manifest.name)) {
        for (const dependency of Object.keys({
          ...pkg.manifest.dependencies,
          ...pkg.manifest.optionalDependencies,
          ...pkg.manifest.peerDependencies,
          ...pkg.manifest.devDependencies,
        })) {
          if (authPackage.test(dependency))
            report(pkg.file, `${pkg.manifest.name} must not depend on Auth package ${dependency}`);
        }
      }
      if (pkg.manifest.name === "@yielded/auth-persistence") {
        for (const dependency of Object.keys({
          ...pkg.manifest.dependencies,
          ...pkg.manifest.optionalDependencies,
          ...pkg.manifest.peerDependencies,
          ...pkg.manifest.devDependencies,
        })) {
          if (dependency.includes("drizzle"))
            report(
              pkg.file,
              `Drizzle dependency ${dependency} belongs in @yielded/auth-persistence-drizzle`,
            );
        }
        for (const key of Object.keys(pkg.manifest.exports)) {
          if (/drizzle/i.test(key))
            report(pkg.file, `Drizzle export ${key} belongs in @yielded/auth-persistence-drizzle`);
        }
      }
    }

    const byName = new Map(packages.map((pkg) => [pkg.manifest.name, pkg]));
    let entries = 0;

    for (const pkg of packages) {
      const base = `packages/${pkg.directory}`;
      const { manifest } = pkg;
      const publicBarrels = new Set<string>();

      for (const target of Object.values(manifest.exports)) {
        const file = `${base}/${target.slice(2)}`;
        const source = yield* parse(file);

        if (
          source.statements.length > 0 &&
          source.statements.every((statement) => ts.isExportDeclaration(statement))
        )
          publicBarrels.add(file);
      }

      if (!manifest.private) {
        const filenames = new Set(yield* fs.readDirectory(path.join(root, base, "src")));
        const bins = Object.values(manifest.bin ?? {});

        for (const binary of bins)
          if (!/^\.\/dist\/[A-Za-z][A-Za-z0-9_-]*\.mjs$/.test(binary))
            report(pkg.file, `${binary} must be a flat ./dist/command.mjs binary`);

        const targets = [
          ...Object.values(manifest.exports),
          ...bins.map((binary) => binary.replace("./dist/", "./src/").replace(/\.mjs$/, ".ts")),
        ];

        for (const filename of filenames) {
          if (filename.endsWith(".ts") && !targets.includes(`./src/${filename}`)) {
            report(
              pkg.file,
              `Unpublished source root module ./src/${filename} must move under internal/`,
            );
          }
        }
        if (
          (manifest.name === "@yielded/auth" || manifest.exports["."] !== undefined) &&
          manifest.exports["."] !== "./src/index.ts"
        )
          report(pkg.file, "Root must target ./src/index.ts");
        if (new Set(targets).size !== targets.length)
          report(pkg.file, "Export targets must be unique");
        for (const [key, target] of Object.entries(manifest.exports)) {
          entries++;
          if (
            key !== "." &&
            (!/^\.\/[A-Za-z][A-Za-z0-9-]*(?:\/[A-Za-z][A-Za-z0-9-]*)*$/.test(key) ||
              key.split("/").some((part) => part === "internal" || part === "index"))
          ) {
            report(
              pkg.file,
              `${key} must be an explicit public module or group path, excluding internal and index paths`,
            );
          }
          // The release publisher currently maps flat source entries to flat dist artifacts.
          if (!/^\.\/src\/[A-Za-z][A-Za-z0-9_-]*\.ts$/.test(target))
            report(
              pkg.file,
              `${target} must be a flat ./src/Module.ts entry supported by the publisher`,
            );
          if (!filenames.has(target.slice("./src/".length)))
            report(pkg.file, `${target} is missing or has different filesystem casing`);
        }
        // Core's root and lowercase entrypoints are namespace groups. Companion
        // packages may instead expose named facades, such as AuthPersistence.
        for (const [key, target] of Object.entries(manifest.exports)) {
          if (manifest.name !== "@yielded/auth") continue;
          if (key !== "." && !/^\.\/[a-z][a-z0-9-]*$/.test(key)) continue;
          const index = yield* parse(`${base}/${target.slice(2)}`);
          const namespaces = new Set<string>();

          for (const statement of index.statements) {
            if (ts.isEmptyStatement(statement)) continue;
            if (
              !ts.isExportDeclaration(statement) ||
              !statement.exportClause ||
              !statement.moduleSpecifier ||
              !ts.isStringLiteral(statement.moduleSpecifier)
            ) {
              report(
                index.fileName,
                "Public groups must contain only namespace or explicit named re-export declarations",
              );
              continue;
            }
            if (ts.isNamedExports(statement.exportClause)) {
              if (
                statement.exportClause.elements.length === 0 ||
                statement.exportClause.elements.some((element) => element.name.text === "default")
              )
                report(
                  index.fileName,
                  "Public group named re-exports must be nonempty and cannot export a default",
                );
              continue;
            }
            const name = statement.exportClause.name.text;

            if (namespaces.has(name)) report(index.fileName, `Duplicate namespace ${name}`);
            namespaces.add(name);
            if (
              !/^[A-Z][A-Za-z0-9]*$/.test(name) ||
              statement.moduleSpecifier.text !== `./${name}.ts` ||
              !targets.includes(`./src/${name}.ts`)
            ) {
              report(
                index.fileName,
                `${name} must reference the published same-name module ./${name}.ts`,
              );
            }
          }
        }
        const config = yield* parse(`${base}/vite.config.ts`);
        const packed: Array<string> = [];

        walk(config, (node) => {
          if (
            !ts.isPropertyAssignment(node) ||
            propertyName(node.name) !== "pack" ||
            !ts.isObjectLiteralExpression(node.initializer)
          )
            return;
          for (const property of node.initializer.properties) {
            if (!ts.isPropertyAssignment(property) || propertyName(property.name) !== "entry")
              continue;
            if (!ts.isArrayLiteralExpression(property.initializer)) {
              report(config.fileName, "Pack entries must be an explicit array of source paths");
              continue;
            }
            for (const entry of property.initializer.elements) {
              if (ts.isStringLiteral(entry)) packed.push(`./${entry.text.replace(/^\.\//, "")}`);
              else report(config.fileName, "Pack entries must be literal source paths");
            }
          }
        });
        if (new Set(packed).size !== packed.length)
          report(config.fileName, "Pack entries must be unique");
        for (const target of targets)
          if (!packed.includes(target)) report(config.fileName, `Missing pack entry ${target}`);
        for (const target of packed)
          if (!targets.includes(target))
            report(config.fileName, `Unpublished pack entry ${target}`);
      }
      const pending = ["src", "test"];

      while (pending.length > 0) {
        const relative = pending.pop();

        if (relative === undefined) break;
        const directory = path.join(root, base, relative);

        if (!(yield* fs.exists(directory))) continue;
        for (const filename of yield* fs.readDirectory(directory)) {
          const file: string = `${base}/${relative}/${filename}`;

          if ((yield* fs.stat(path.join(root, file))).type === "Directory") {
            pending.push(`${relative}/${filename}`);
            continue;
          }
          if (!/\.[cm]?tsx?$/.test(filename)) continue;
          const source = yield* parse(file);

          const testOnly: boolean =
            /(?:^|\/)(?:test|tests|__tests__|fixtures)(?:\/|$)|\.(?:test|spec)\./.test(file) ||
            Object.entries(manifest.exports).some(
              ([key, target]): boolean =>
                (key === "./Testing" || key.startsWith("./Testing/")) &&
                target === `./${relative}/${filename}`,
            );

          const dependencies = {
            ...manifest.dependencies,
            ...manifest.optionalDependencies,
            ...manifest.peerDependencies,
          };

          const imports: Array<{ specifier: string; typeOnly: boolean }> = [];

          const allowed: ReadonlySet<string> | undefined = testOnly
            ? undefined
            : reusableDependencies(manifest.name);

          walk(source, (node) => {
            if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
              const clause = node.importClause;
              const bindings = clause?.namedBindings;

              const typeOnly =
                clause?.isTypeOnly === true ||
                (clause?.name === undefined &&
                  bindings !== undefined &&
                  ts.isNamedImports(bindings) &&
                  bindings.elements.length > 0 &&
                  bindings.elements.every((element) => element.isTypeOnly));

              imports.push({ specifier: node.moduleSpecifier.text, typeOnly });
            }
            if (
              ts.isExportDeclaration(node) &&
              node.moduleSpecifier &&
              ts.isStringLiteral(node.moduleSpecifier)
            ) {
              const typeOnly =
                node.isTypeOnly ||
                (node.exportClause !== undefined &&
                  ts.isNamedExports(node.exportClause) &&
                  node.exportClause.elements.length > 0 &&
                  node.exportClause.elements.every((element) => element.isTypeOnly));

              imports.push({ specifier: node.moduleSpecifier.text, typeOnly });
            }
            if (
              ts.isImportTypeNode(node) &&
              ts.isLiteralTypeNode(node.argument) &&
              ts.isStringLiteral(node.argument.literal)
            )
              imports.push({ specifier: node.argument.literal.text, typeOnly: true });
            if (
              ts.isImportEqualsDeclaration(node) &&
              ts.isExternalModuleReference(node.moduleReference) &&
              node.moduleReference.expression &&
              ts.isStringLiteral(node.moduleReference.expression)
            )
              imports.push({
                specifier: node.moduleReference.expression.text,
                typeOnly: node.isTypeOnly,
              });
            if (
              ts.isCallExpression(node) &&
              (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
                (ts.isIdentifier(node.expression) && node.expression.text === "require"))
            ) {
              const argument = node.arguments[0];

              if (argument && ts.isStringLiteralLike(argument))
                imports.push({ specifier: argument.text, typeOnly: false });
              else if (allowed !== undefined)
                report(file, `${manifest.name} dependency loading must use a literal specifier`);
            }
          });
          for (const { specifier, typeOnly } of imports) {
            if (
              ["@yielded/crypto", "@yielded/jose", "@yielded/oauth"].includes(manifest.name) &&
              authPackage.test(specifier)
            )
              report(file, `${manifest.name} must not import Auth module ${specifier}`);
            if (manifest.name === "@yielded/auth-persistence" && /drizzle/i.test(specifier))
              report(
                file,
                `Drizzle import ${specifier} belongs in @yielded/auth-persistence-drizzle`,
              );
            if (specifier.startsWith(".")) {
              const resolved = path
                .relative(root, path.resolve(root, path.dirname(file), specifier))
                .replaceAll("\\", "/");

              if (resolved.startsWith("packages/") && !resolved.startsWith(`${base}/`))
                report(file, `Import ${specifier} must use the owning package's public module`);
              if (
                allowed !== undefined &&
                (!resolved.startsWith(`${base}/src/`) || resolved.includes("/node_modules/"))
              )
                report(file, `${manifest.name} relative import ${specifier} leaves owned source`);
              if (
                !testOnly &&
                !publicBarrels.has(file) &&
                publicBarrels.has(resolved.replace(/(?:\.ts)?$/, ".ts"))
              )
                report(
                  file,
                  `Import ${specifier} must go directly to its implementation, not a public barrel`,
                );
              continue;
            }

            const name = specifier.startsWith("@")
              ? specifier.split("/").slice(0, 2).join("/")
              : specifier.split("/")[0];

            if (
              allowed !== undefined &&
              name !== manifest.name &&
              !(name !== undefined && allowed.has(name)) &&
              !(manifest.name === "@yielded/crypto" && isBuiltin(specifier))
            )
              report(
                file,
                `${manifest.name} import ${specifier} is outside its runtime dependency graph`,
              );

            const owner: (typeof packages)[number] | undefined =
              name === undefined ? undefined : byName.get(name);

            if (!owner) {
              if (
                specifier.startsWith("@yielded/") ||
                specifier === "@yielded/auth" ||
                specifier.startsWith("@yielded/auth/")
              )
                report(file, `${specifier} references an unknown workspace package`);
              continue;
            }

            const key =
              specifier === owner.manifest.name
                ? "."
                : `.${specifier.slice(owner.manifest.name.length)}`;

            if (owner.manifest.exports[key] === undefined)
              report(file, `${specifier} is not a public export of ${owner.manifest.name}`);
            if (
              owner !== pkg &&
              dependencies[owner.manifest.name] === undefined &&
              (!(testOnly || typeOnly) ||
                manifest.devDependencies?.[owner.manifest.name] === undefined)
            )
              report(
                file,
                `${specifier} needs a declared ${testOnly || typeOnly ? "development or runtime" : "runtime"} dependency`,
              );
          }
        }
      }
    }
    if (problems.length > 0)
      return yield* PackageExportsError.make({ message: problems.join("\n") });
    yield* Console.log(
      `Package exports check passed: ${packages.filter((pkg) => !pkg.manifest.private).length} public packages, ${entries} entries.`,
    );
  },
  Effect.mapError((cause) =>
    cause._tag === "PackageExportsError"
      ? cause
      : PackageExportsError.make({
          message: `Could not inspect package exports: ${cause.message}`,
          cause,
        }),
  ),
);

const program = Effect.gen(function* () {
  const path = yield* Path.Path;
  const file = yield* path.fromFileUrl(new URL(import.meta.url));

  yield* verifyPackageExports(path.resolve(path.dirname(file), ".."));
}).pipe(
  Effect.tapError((error) => Console.error(error.message)),
  Effect.provide(NodeServices.layer),
);

if (import.meta.main) NodeRuntime.runMain(program, { disableErrorReporting: true });
