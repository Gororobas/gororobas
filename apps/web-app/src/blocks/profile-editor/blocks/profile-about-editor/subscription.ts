import { Handle } from "@gororobas/domain/common/primitives"
import { Duration, Effect, Option, Schema, Stream } from "effect"

import { GororobasApiClient } from "../../../../api-client"
import { ProfileAboutEditorBlock } from "./definition"
import { Message } from "./message"
import { HandleCheck } from "./model"

/** Lets typing settle before asking whether a handle is free. Each new handle interrupts the last. */
const TYPING_SETTLE_TIME = Duration.millis(350)

export const subscriptions = ProfileAboutEditorBlock.makeSubscriptions((entry) => ({
  profile: entry(
    "LoadMyProfile",
    { reloadCount: Schema.Int },
    {
      messages: [Message.SucceededLoadProfile, Message.FailedLoadProfile],
      modelToDependencies: (model) => ({ reloadCount: model.reloadCount }),
      handler: function* () {
        const api = yield* GororobasApiClient

        return () =>
          Stream.fromEffect(
            api.people.getMyProfile().pipe(
              Effect.filterOrFail(
                (profile) => !(profile === null),
                (_profile) => "ProfileMissing",
              ),
              Effect.match({
                onFailure: (error) => Message.FailedLoadProfile({ error: { cause: error } }),
                onSuccess: (profile) => Message.SucceededLoadProfile({ profile }),
              }),
            ),
          )
      },
    },
  ),
  handle: entry(
    "CheckHandleAvailability",
    { maybeHandle: Schema.Option(Handle) },
    {
      messages: [Message.SucceededCheckHandle, Message.FailedCheckHandle],
      modelToDependencies: (model) => ({
        maybeHandle: HandleCheck.guards.Checking(model.handleCheck)
          ? Schema.decodeOption(Handle)(model.form.handle)
          : Option.none(),
      }),
      handler: function* () {
        const api = yield* GororobasApiClient

        return ({ maybeHandle }) =>
          Option.match(maybeHandle, {
            onNone: () => Stream.empty,
            onSome: (handle) =>
              Stream.fromEffect(
                Effect.sleep(TYPING_SETTLE_TIME).pipe(
                  Effect.andThen(api.people.getHandleAvailability({ query: { handle } })),
                  Effect.match({
                    onFailure: () => Message.FailedCheckHandle({ handle }),
                    onSuccess: ({ isAvailable }) =>
                      Message.SucceededCheckHandle({ handle, isAvailable }),
                  }),
                ),
              ),
          })
      },
    },
  ),
}))
