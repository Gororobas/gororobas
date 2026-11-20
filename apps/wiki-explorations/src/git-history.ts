import { Effect, Schema, Stream } from "effect"
import { ChildProcess, ChildProcessSpawner } from "effect/process"

import { decodeCanvasFile, type Canvas } from "./graph.js"

export type CanvasHistoryComparison = {
  ref: string
  commit: string
  baseline: Canvas | null
  commits: { hash: string; date: string; subject: string }[]
}

const runGit = (directory: string, args: readonly string[]) =>
  Effect.gen(function* () {
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
    const child = yield* spawner.spawn(
      ChildProcess.make("git", args, { cwd: directory, stderr: "ignore" }),
    )
    const [output, exitCode] = yield* Effect.all(
      [Stream.mkString(Stream.decodeText(child.stdout)), child.exitCode],
      { concurrency: "unbounded" },
    )
    return { output, exitCode }
  }).pipe(Effect.scoped, Effect.timeout("5 seconds"))

export const GitRef = Schema.String.check(Schema.isPattern(/^(?!-)[^\s:\\\p{Cc}]{1,200}$/u))

class GitHistoryError extends Schema.TaggedError<GitHistoryError>()("GitHistoryError", {
  message: Schema.String,
}) {}

export const readCanvasHistory = ({
  directory,
  id,
  ref,
}: {
  directory: string
  id: string
  ref: string
}) =>
  Effect.gen(function* () {
    const path = `${id}.json`
    const git = (args: readonly string[]) => runGit(directory, args)

    const resolved = yield* git([
      "rev-parse",
      "--verify",
      "--quiet",
      "--end-of-options",
      `${ref}^{commit}`,
    ])

    if (resolved.exitCode === 1) return null
    const commit = resolved.output.trim()
    if (resolved.exitCode !== 0 || !/^[0-9a-f]{40}([0-9a-f]{24})?$/.test(commit)) {
      return yield* new GitHistoryError({ message: "Git did not resolve a commit." })
    }

    const [entry, log] = yield* Effect.all(
      [
        git(["ls-tree", "--format=%(objectname)", commit, "--", path]),
        git([
          "log",
          "-n",
          "12",
          "--no-notes",
          "--no-show-signature",
          "--no-color",
          "-z",
          "--format=%H%x00%cs%x00%s",
          "HEAD",
          "--",
          path,
        ]),
      ],
      { concurrency: "unbounded" },
    )

    if (entry.exitCode !== 0 || log.exitCode !== 0) {
      return yield* new GitHistoryError({ message: "Git could not read canvas history." })
    }

    let baseline = null
    const object = entry.output.trim()

    if (object) {
      const file = yield* git(["cat-file", "blob", object])
      if (file.exitCode !== 0) {
        return yield* new GitHistoryError({ message: "Git could not read the canvas." })
      }
      baseline = yield* decodeCanvasFile(file.output)
    }

    const commits = Array.from(
      log.output.matchAll(/([0-9a-f]+)\0([^\0]*)\0([^\0]*)\0/g),
      ([, hash, date, subject]) => ({ hash, date, subject }),
    )
    return { ref, commit, baseline, commits } satisfies CanvasHistoryComparison
  })
