import { expect, it } from "@effect/vitest"
import { Deferred, Effect, Fiber } from "effect"
import { HttpClient, HttpClientResponse } from "effect/http"

import { makeClient } from "./api-client"
import { makeSessionAccess, SessionAccess, sessionStorageKey } from "./session-access"

it.effect("does not send application requests until deferred sign-out has settled", () =>
  Effect.gen(function* () {
    localStorage.setItem(sessionStorageKey, '{"identity":null,"hasPendingSignOut":true}')
    const started = yield* Deferred.make<void>()
    const finished = yield* Deferred.make<void>()
    const events: string[] = []

    const access = yield* makeSessionAccess({
      auth: {
        getSession: () => Effect.succeed(null),
        renewSession: () => Effect.die("unexpected renewal"),
        signOut: () =>
          Effect.gen(function* () {
            yield* Deferred.succeed(started, undefined)
            yield* Deferred.await(finished)
            events.push("revoked")
          }),
      },
      storage: localStorage,
      online: () => true,
      changed: () => {},
    })

    const client = yield* makeClient.pipe(
      Effect.provideService(SessionAccess, access),
      Effect.provideService(
        HttpClient.HttpClient,
        HttpClient.make((request) =>
          Effect.sync(() => {
            events.push("request")
            return HttpClientResponse.fromWeb(
              request,
              new Response("null", { headers: { "content-type": "application/json" } }),
            )
          }),
        ),
      ),
    )

    const request = yield* client.people.getMyProfile().pipe(Effect.forkChild)
    yield* Deferred.await(started)
    expect(events).toEqual([])
    yield* Deferred.succeed(finished, undefined)
    yield* Fiber.join(request)
    expect(events).toEqual(["revoked", "request"])
    localStorage.clear()
  }),
)
