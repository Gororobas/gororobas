import { Clock, Effect, HashMap, Option, SubscriptionRef } from 'effect'
import { Rpc } from 'effect/rpc'
import { randomUUID } from 'node:crypto'

import * as Shared from '@typing-game/shared'

import { ROOM_ID_WORDS } from '../constants.ts'
import * as Room from '../room.ts'

export const createRoom =
  (roomByIdRef: SubscriptionRef.SubscriptionRef<typeof Shared.RoomById.Type>) =>
  (payload: Rpc.Payload<typeof Shared.createRoomRpc>) =>
    Effect.gen(function* () {
      const roomId = yield* Room.generateUniqueId(ROOM_ID_WORDS)
      const playerId = yield* Effect.sync(() => randomUUID())

      const player: typeof Shared.Player.Type = {
        id: playerId,
        username: payload.username,
      }

      const createdAt = yield* Clock.currentTimeMillis

      const newRoom: typeof Shared.Room.Type = {
        id: roomId,
        players: [player],
        hostId: playerId,
        status: Shared.Waiting.make({}),
        maybeGame: Option.none(),
        maybeScoreboard: Option.none(),
        createdAt,
        usedGameTexts: [],
      }

      yield* SubscriptionRef.update(roomByIdRef, roomById =>
        HashMap.set(roomById, newRoom.id, newRoom),
      )

      return { player, room: newRoom }
    })
