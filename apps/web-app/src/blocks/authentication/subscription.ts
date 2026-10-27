import { Effect, Stream } from "effect"

import { SessionAccess, sessionChangedEvent, sessionStorageKey } from "../../session-access"
import { AuthenticationDefinition } from "./definition"
import { Message } from "./message"

export const subscriptions = AuthenticationDefinition.makeSubscriptions((entry) => ({
  session: entry(
    "WatchSessionAccess",
    {},
    {
      messages: [Message.ChangedSessionAccess],
      modelToDependencies: () => ({}),
      handler: function* () {
        return () =>
          Stream.fromEventListener(window, sessionChangedEvent).pipe(
            Stream.mapEffect(() =>
              Effect.map(SessionAccess, (access) =>
                Message.ChangedSessionAccess({ state: access.read() }),
              ),
            ),
          )
      },
    },
  ),
  connection: entry(
    "WatchConnection",
    {},
    {
      messages: [Message.ChangedConnection],
      modelToDependencies: () => ({}),
      handler: function* () {
        return () =>
          Stream.merge(
            Stream.fromEventListener(window, "online"),
            Stream.fromEventListener(window, "offline"),
          ).pipe(
            Stream.merge(
              Stream.fromEventListener<StorageEvent>(window, "storage").pipe(
                Stream.filter((event) => event.key === sessionStorageKey || event.key === null),
              ),
            ),
            Stream.merge(Stream.fromEventListener(window, "focus")),
            Stream.map(() => Message.ChangedConnection()),
          )
      },
    },
  ),
}))
