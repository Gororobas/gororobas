import { BunRuntime, BunServices } from "@effect/platform-bun";
import { Console, Effect, FileSystem, Path, Schema, Stdio } from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/process";

class MigrationGenerationFailed extends Schema.TaggedError<MigrationGenerationFailed>()(
  "MigrationGenerationFailed",
  { reason: Schema.String },
) {
  override get message() {
    return this.reason;
  }
}

const SnapshotJson = Schema.fromJsonString(Schema.Unknown);
const decodeSnapshot = Schema.decodeEffect(SnapshotJson);
const encodeSnapshot = Schema.encodeEffect(SnapshotJson);

const Configuration = Schema.Struct({
  default: Schema.Struct({ out: Schema.optionalKey(Schema.String) }),
});

// Drizzle parses the flags. After it succeeds, these two locate its output.
const flagValue = (args: ReadonlyArray<string>, flag: string) => {
  const index = args.findIndex((arg) => arg === flag || arg.startsWith(`${flag}=`));

  return index === -1
    ? undefined
    : args[index] === flag
      ? args[index + 1]
      : args[index].slice(flag.length + 1);
};

const outputDirectory = Effect.fn("dbGenerate.outputDirectory")(function* (
  args: ReadonlyArray<string>,
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const out = flagValue(args, "--out");

  if (out !== undefined) return path.resolve(out);
  const config = path.resolve(flagValue(args, "--config") ?? "drizzle.config.ts");

  if (!(yield* fs.exists(config))) return path.resolve("drizzle");
  const url = yield* path.toFileUrl(config);

  const module = yield* Effect.tryPromise({
    try: () => import(url.href),
    catch: () =>
      MigrationGenerationFailed.make({ reason: `Could not load Drizzle config: ${config}` }),
  });

  const configuration = yield* Schema.decodeUnknownEffect(Configuration)(module).pipe(
    Effect.mapError(() =>
      MigrationGenerationFailed.make({ reason: `Invalid Drizzle output directory: ${config}` }),
    ),
  );

  return path.resolve(configuration.default.out ?? "drizzle");
});

export const compactSnapshots = Effect.fn("dbGenerate.compactSnapshots")(function* (root: string) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;

  if (!(yield* fs.exists(root))) return;
  const entries = yield* fs.readDirectory(root, { recursive: true });

  for (const entry of entries) {
    if (path.basename(entry) !== "snapshot.json") continue;
    const filename = path.join(root, entry);
    const source = yield* fs.readFileString(filename);
    const compact = `${yield* encodeSnapshot(yield* decodeSnapshot(source))}\n`;

    if (source !== compact) yield* fs.writeFileString(filename, compact);
  }
});

export const generate = Effect.gen(function* () {
  const path = yield* Path.Path;
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  const argv = yield* (yield* Stdio.Stdio).args;
  const args = argv[0] === "--" ? argv.slice(1) : argv;

  const handle = yield* spawner.spawn(
    ChildProcess.make("bun", ["x", "--bun", "drizzle-kit", "generate", ...args], {
      cwd: path.resolve("."),
      extendEnv: true,
      stdin: "inherit",
      stdout: "inherit",
      stderr: "inherit",
    }),
  );

  const exitCode = yield* handle.exitCode;

  if (exitCode !== ChildProcessSpawner.ExitCode(0))
    return yield* MigrationGenerationFailed.make({
      reason: `drizzle-kit generate failed with exit code ${exitCode}`,
    });
  if (args.some((arg) => ["--help", "-h", "--explain", "--explain=true"].includes(arg))) return;

  yield* compactSnapshots(yield* outputDirectory(args));
});

if (import.meta.main)
  BunRuntime.runMain(
    generate.pipe(
      Effect.tapError((error) => Console.error(error.message)),
      Effect.scoped,
      Effect.provide(BunServices.layer),
    ),
    { disableErrorReporting: true },
  );
