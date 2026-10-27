import { Cause, Effect, Exit, ManagedRuntime, Runtime } from "effect"
import { constVoid } from "effect/Function"

/**
 * Runs the application's ManagedRuntime with Node-style process lifetime and signal handling.
 *
 * The HTTP server and background workflows share the application's SQL and cluster services.
 */
export const runMainWithCustomRuntime = <RuntimeServices, RuntimeError, ProgramError>({
  runtime,
  program,
  teardown = Runtime.defaultTeardown,
}: {
  runtime: ManagedRuntime.ManagedRuntime<RuntimeServices, RuntimeError>
  program: Effect.Effect<unknown, ProgramError, RuntimeServices>
  teardown?: Runtime.Teardown | undefined
}) => {
  const fiber = runtime.runFork(program)

  const keepAlive = setInterval(constVoid, 2 ** 31 - 1)
  let receivedSignal = false

  fiber.addObserver((exit) => {
    if (!receivedSignal) {
      process.removeListener("SIGINT", onSigint)
      process.removeListener("SIGTERM", onSigint)
    }

    // Report why the program stopped, as NodeRuntime.runMain does; otherwise a startup failure
    // (a missing setting, a locked database) exits with code 1 and no explanation.
    const reportFailure =
      Exit.isFailure(exit) && !Cause.hasInterruptsOnly(exit.cause)
        ? Effect.logError(exit.cause)
        : Effect.void

    // Dispose shared SQL/cluster services before exiting so SQLite checkpoints and releases its files.
    Effect.runFork(Effect.andThen(reportFailure, runtime.disposeEffect)).addObserver((disposed) => {
      clearInterval(keepAlive)

      teardown(Exit.isFailure(disposed) ? disposed : exit, (code) => {
        if (receivedSignal || code !== 0) {
          process.exit(code)
        }
      })
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
