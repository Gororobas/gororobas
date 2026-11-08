import { Stream } from "effect"

import { SessionAccess, sessionStorageKey } from "../../session-access"
import { AuthenticationBlock } from "./definition"
import { Message } from "./message"

export const subscriptions = AuthenticationBlock.makeSubscriptions((entry) => ({
  session: entry(
    "WatchSessionAccess",
    {},
    {
      messages: [Message.ChangedSessionAccess],
      modelToDependencies: () => ({}),
      handler: function* () {
        const access = yield* SessionAccess
        return () =>
          access.changes.pipe(Stream.map((state) => Message.ChangedSessionAccess({ state })))
      },
    },
  ),
  accountSwitches: entry(
    "WatchAccountSwitches",
    {},
    {
      messages: [Message.SwitchedAccount],
      modelToDependencies: () => ({}),
      handler: function* () {
        const access = yield* SessionAccess
        return () => access.switchedAccounts.pipe(Stream.map(() => Message.SwitchedAccount()))
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
