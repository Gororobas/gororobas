/**
 * Fails when a test file exists that no Vitest project collects.
 *
 * Projects select their tests by glob, so a misconfigured include/exclude can silently drop
 * a whole suite from `pnpm run check`. External-service tests (`*.external.test.ts`) are the only
 * intentional exclusion; they run through `pnpm --filter @gororobas/server test:external`.
 */
import { NodeRuntime, NodeServices } from "@effect/platform-node"
import { Array as EffectArray, Console, Effect, HashSet, Path, Schema } from "effect"
import { ChildProcess, ChildProcessSpawner } from "effect/process"
import * as Glob from "glob"

class UncollectedTestsError extends Schema.TaggedError<UncollectedTestsError>()(
  "UncollectedTestsError",
  { files: Schema.Array(Schema.String) },
) {}

const CollectedTestFiles = Schema.fromJsonString(
  Schema.Array(Schema.Struct({ file: Schema.String, projectName: Schema.String })),
)

const program = Effect.gen(function* () {
  const path = yield* Path.Path
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
  const root = path.resolve(import.meta.dirname, "..")

  const onDisk = Glob.sync("{apps,packages,linting}/**/*.test.{ts,tsx,mts,mjs}", {
    cwd: root,
    absolute: true,
    ignore: ["**/node_modules/**", "**/dist/**", "**/build/**", "**/*.external.test.ts"],
  })

  const output = yield* spawner.string(
    ChildProcess.make("pnpm", ["exec", "vitest", "list", "--filesOnly", "--json"], { cwd: root }),
  )
  const collected = HashSet.fromIterable(
    (yield* Schema.decodeEffect(CollectedTestFiles)(output)).map(({ file }) => file),
  )

  const uncollected = EffectArray.sort(
    onDisk.filter((file) => !HashSet.has(collected, file)).map((file) => path.relative(root, file)),
    (left: string, right: string) => (left < right ? -1 : left > right ? 1 : 0),
  )

  if (EffectArray.isReadonlyArrayNonEmpty(uncollected)) {
    yield* Console.error(`Test files no Vitest project collects:\n  ${uncollected.join("\n  ")}`)
    return yield* new UncollectedTestsError({ files: uncollected })
  }

  yield* Console.log(`All ${onDisk.length} test files are collected by a Vitest project.`)
})

program.pipe(Effect.provide(NodeServices.layer), NodeRuntime.runMain)
