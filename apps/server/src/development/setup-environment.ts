/**
 * Creates `.env` from `.env.example` with freshly generated authentication keys, so a new
 * checkout (a teammate's machine or a cloud agent's sandbox) can start the server at once.
 * An existing `.env` is never modified.
 *
 * pnpm --filter @gororobas/server setup:env
 */
import { NodeRuntime, NodeServices } from "@effect/platform-node"
import { Console, Effect, FileSystem } from "effect"
import * as Base64Url from "effect/encoding/Base64Url"

const GENERATED_KEYS = ["AUTH_BINDING_KEY", "AUTH_PROOF_KEY"] as const

const randomKey = Effect.sync(() => Base64Url.encode(crypto.getRandomValues(new Uint8Array(32))))

const program = Effect.gen(function* () {
  const fileSystem = yield* FileSystem.FileSystem

  if (yield* fileSystem.exists(".env")) {
    return yield* Console.log(".env already exists; leaving it untouched")
  }

  const example = yield* fileSystem.readFileString(".env.example")

  const contents = yield* Effect.reduce(
    GENERATED_KEYS,
    () => example,
    (partial, key) =>
      Effect.map(randomKey, (value) =>
        partial.replace(new RegExp(`^${key}=$`, "m"), `${key}=${value}`),
      ),
  )

  yield* fileSystem.writeFileString(".env", contents)
  yield* Console.log(`Created .env with generated ${GENERATED_KEYS.join(" and ")}`)
})

program.pipe(Effect.provide(NodeServices.layer), NodeRuntime.runMain)
