import { Option, Schema } from 'effect'
import { AsyncData } from 'foldkit'

import * as Shared from '@typing-game/shared'

export const RoomPlayerSession = Schema.Struct({
  roomId: Schema.String,
  player: Shared.Player,
})

export const RoomPlayerSessionJsonString = Schema.fromJsonString(
  Schema.toCodecJson(RoomPlayerSession),
)

export const RoomAsyncData = AsyncData.Schema(Shared.Room, Schema.String)

export const Model = Schema.Struct({
  roomAsyncData: RoomAsyncData.schema,
  maybeSession: Schema.Option(RoomPlayerSession),
  userGameText: Schema.String,
  charsTyped: Schema.Number,
  username: Schema.String,
  isRoomIdCopyIndicatorVisible: Schema.Boolean,
  exitCountdownSecondsLeft: Schema.Number,
})

export const capturesKeyboard = (model: typeof Model.Type): boolean => {
  const isRoomPlayable = Option.exists(
    AsyncData.getData(model.roomAsyncData),
    ({ status }) => status._tag === 'Waiting' || status._tag === 'Finished',
  )

  return Option.isSome(model.maybeSession) && isRoomPlayable
}
