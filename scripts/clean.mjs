import { NodeFileSystem, NodeRuntime } from "@effect/platform-node"
import { Effect, FileSystem } from "effect"
import * as Glob from "glob"

Effect.gen(function* () {
  const filesystem = yield* FileSystem.FileSystem
  const directories = [".", ...Glob.sync("packages/*/")]

  yield* Effect.forEach(
    directories,
    (directory) =>
      Effect.forEach(
        [".tsbuildinfo", "build", "dist", "coverage"],
        (file) => filesystem.remove(`${directory}/${file}`, { force: true, recursive: true }),
        { concurrency: 1 },
      ),
    { concurrency: 1 },
  )
}).pipe(Effect.provide(NodeFileSystem.layer), NodeRuntime.runMain)
