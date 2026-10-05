import { Context, Effect, Fiber, Layer, Queue } from "effect";

import { ProofUnavailable } from "./errors";

/** Admission for private, process-local proof delivery.
 *
 * Proof Layers use the built-in scoped worker by default. Supply an override at
 * Layer construction only when the host needs different scheduling semantics.
 *
 * Accept work without awaiting the provider. Bound both pending work and execution;
 * use an application Scope that outlives requests, and never create daemon fibers.
 * Every committed receipt, including suppression and replay, submits one task.
 * Reject full/closed admission with ProofUnavailable, without inspecting the task.
 *
 * Work has no remaining services or typed failures and contains no public result.
 * Keep its closure private: it contains credential material and is not an outbox
 * value. Do not serialize, inspect, log, or automatically retry it. Interruption
 * still propagates after ambiguous delivery settlement. A host that requires work
 * to start after sending the response must supply that release boundary itself.
 */
export class ProofDispatchScheduler extends Context.Service<
  ProofDispatchScheduler,
  {
    readonly schedule: (work: Effect.Effect<void>) => Effect.Effect<void, ProofUnavailable>;
  }
>()("effect-auth/ProofDispatchScheduler") {
  /** Default: one worker, 64 pending tasks, and a 10-second cancellation budget per task.
   * Shared across proof modules in one Layer build; shutdown interrupts pending
   * delivery. Build Auth in an application scope that outlives its requests.
   */
  static readonly layer = Layer.effect(
    this,
    Effect.gen(function* () {
      const queue = yield* Effect.acquireRelease(
        Queue.make<Effect.Effect<void>>({ capacity: 64, strategy: "dropping" }),
        (queue) => Queue.shutdown(queue),
      );

      yield* Effect.gen(function* () {
        while (true) {
          const work = yield* Queue.take(queue);

          // Isolate task interruption while keeping it inside the worker's lifetime.
          const task = yield* work.pipe(
            Effect.timeout("10 seconds"),
            Effect.catchTag("TimeoutError", () => Effect.void),
            Effect.forkChild,
          );

          yield* Fiber.await(task);
        }
      }).pipe(Effect.forkScoped);

      return ProofDispatchScheduler.of({
        schedule: (work) =>
          Queue.offer(queue, work).pipe(
            Effect.flatMap((accepted) => (accepted ? Effect.void : ProofUnavailable.make({}))),
          ),
      });
    }),
  );

  /** Explicit CLI/trusted-workflow fallback. Awaits provider acceptance and exposes
   * its latency; do not use for public eligibility-sensitive request handlers. */
  static readonly layerInline = Layer.succeed(this, { schedule: (work) => work });
}
