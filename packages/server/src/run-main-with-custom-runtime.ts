import { Effect, ManagedRuntime, Runtime } from "effect"
import { constVoid } from "effect/Function"

/**
 * Adaptation of BunRuntime.runMain (which calls @effect/platform/Runtime's `makeRunMain` internally) with a custom ManagedRuntime.
 *
 * In use because we need a shared runtime with better-auth in order to re-use the same database connection.
 */
export const runMainWithCustomRuntime = <E, R>(
  runtime: ManagedRuntime.ManagedRuntime<R, E>,
  program: Effect.Effect<unknown, E, R>,
  teardown: Runtime.Teardown = Runtime.defaultTeardown,
) => {
  const fiber = runtime.runFork(program)

  const keepAlive = setInterval(constVoid, 2 ** 31 - 1)
  let receivedSignal = false

  fiber.addObserver((exit) => {
    if (!receivedSignal) {
      process.removeListener("SIGINT", onSigint)
      process.removeListener("SIGTERM", onSigint)
    }
    clearInterval(keepAlive)
    teardown(exit, (code) => {
      if (receivedSignal || code !== 0) {
        process.exit(code)
      }
    })
  })

  function onSigint() {
    receivedSignal = true
    process.removeListener("SIGINT", onSigint)
    process.removeListener("SIGTERM", onSigint)
    fiber.interruptUnsafe(fiber.id)
  }

  process.on("SIGINT", onSigint)
  process.on("SIGTERM", onSigint)
}
