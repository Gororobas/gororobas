import { Effect, ManagedRuntime, Runtime } from "effect"
import { constVoid } from "effect/Function"

/**
 * Runs the application's ManagedRuntime with Node-style process lifetime and signal handling.
 *
 * The HTTP server and background workflows share the application's SQL and cluster services.
 */
export const runMainWithCustomRuntime = <
  RuntimeServices,
  RuntimeError,
  ProgramServices,
  ProgramError,
>(
  runtime: ManagedRuntime.ManagedRuntime<RuntimeServices, RuntimeError>,
  program: Effect.Effect<unknown, ProgramError, ProgramServices>,
  teardown: Runtime.Teardown = Runtime.defaultTeardown,
) => {
  const fiber = runtime.runFork(
    // oxlint-disable-next-line effect/casting-awareness, effect/avoid-any -- the custom runtime is the application boundary.
    program as unknown as Effect.Effect<unknown, RuntimeError, RuntimeServices>,
  )

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
