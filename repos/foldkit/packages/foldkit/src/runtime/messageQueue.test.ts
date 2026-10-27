import { Effect, Fiber, Option, Result } from 'effect'
import { expect, it } from 'vitest'

import { makeMessageQueue } from './messageQueue.js'
import { makeRuntimeStatus } from './runtimeStatus.js'

it('checks occurrence validity when buffered Messages reach update', async () => {
  const processed: Array<string> = []
  let isCurrent = true
  await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const queue = yield* makeMessageQueue<string>({
          status: makeRuntimeStatus(),
          processMessage: message => {
            processed.push(message)
          },
          crashWith: () => Effect.void,
        })
        queue.enqueueMessage('removed occurrence', () => isCurrent)
        queue.enqueueMessage('root Message')
        isCurrent = false
        queue.completeBoot()
        expect(processed).toEqual(['root Message'])
        queue.enqueueMessage('stale after boot', () => isCurrent)
        expect(processed).toEqual(['root Message'])
      }),
    ),
  )
})

it('acknowledges only Messages processed after their queue guards run', async () => {
  await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const processed: Array<string> = []
        let isCurrent = true
        const queue = yield* makeMessageQueue<string>({
          status: makeRuntimeStatus(),
          processMessage: message => {
            processed.push(message)
          },
          crashWith: () => Effect.void,
        })
        const accepted = yield* Effect.forkChild(
          queue.enqueueMessageReceiptEffect('accepted'),
        )
        const stale = yield* Effect.forkChild(
          queue.enqueueMessageReceiptEffect('stale', () => isCurrent),
        )
        yield* Effect.yieldNow

        isCurrent = false
        queue.completeBoot()

        expect(yield* Fiber.join(accepted)).toEqual(
          Result.succeed(Option.some(undefined)),
        )
        expect(yield* Fiber.join(stale)).toEqual(Result.succeed(Option.none()))
        expect(processed).toEqual(['accepted'])
      }),
    ),
  )
})

it('returns the target processing result after earlier buffered work', async () => {
  await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        let nextHistoryIndex = 0
        const queue = yield* makeMessageQueue<string, number>({
          status: makeRuntimeStatus(),
          processMessage: () => nextHistoryIndex++,
          crashWith: () => Effect.void,
        })
        queue.enqueueMessage('earlier buffered Message')
        const target = yield* Effect.forkChild(
          queue.enqueueMessageReceiptEffect('target Message'),
        )
        yield* Effect.yieldNow

        queue.completeBoot()

        expect(yield* Fiber.join(target)).toEqual(
          Result.succeed(Option.some(1)),
        )
      }),
    ),
  )
})

it('settles buffered receipts when the queue scope closes', async () => {
  const receipt = await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const queue = yield* makeMessageQueue<string>({
          status: makeRuntimeStatus(),
          processMessage: () => undefined,
          crashWith: () => Effect.void,
        })
        const receipt = Effect.runFork(
          queue.enqueueMessageReceiptEffect('never processed'),
        )
        yield* Effect.yieldNow
        return receipt
      }),
    ),
  )

  expect(Result.isFailure(await Effect.runPromise(Fiber.join(receipt)))).toBe(
    true,
  )
})

it('settles boot-buffered receipts when a terminal crash drains the queue', async () => {
  await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const status = makeRuntimeStatus()
        const queue = yield* makeMessageQueue<string>({
          status,
          processMessage: () => undefined,
          crashWith: () => Effect.void,
        })
        const receipt = yield* Effect.forkChild(
          queue.enqueueMessageReceiptEffect('buffered before boot'),
        )
        yield* Effect.yieldNow

        status.isCrashed = true
        queue.drainPendingMessages()

        expect(Result.isFailure(yield* Fiber.join(receipt))).toBe(true)
      }),
    ),
  )
})

it('settles active and remaining receipts when processing crashes', async () => {
  await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const queue = yield* makeMessageQueue<string>({
          status: makeRuntimeStatus(),
          processMessage: () => {
            throw new Error('update crashed')
          },
          crashWith: () => Effect.void,
        })
        const crashing = yield* Effect.forkChild(
          queue.enqueueMessageReceiptEffect('crashing Message'),
        )
        const remaining = yield* Effect.forkChild(
          queue.enqueueMessageReceiptEffect('remaining Message'),
        )
        yield* Effect.yieldNow

        queue.completeBoot()

        expect(Result.isFailure(yield* Fiber.join(crashing))).toBe(true)
        expect(Result.isFailure(yield* Fiber.join(remaining))).toBe(true)
      }),
    ),
  )
})
